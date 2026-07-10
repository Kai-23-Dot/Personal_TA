-- Goal-bound study groups: goals, recurring meeting slots, and one-tap check-ins.
--
-- Groups become accountable instead of open-ended:
--   * goal + target_end_date  → every new group is created around a time-boxed goal
--     (columns are nullable so legacy rows keep working; the API layer requires
--     them for all newly created groups)
--   * group_meetings          → a group cannot be created without at least one
--     recurring meeting slot (enforced in the API)
--   * group_checkins          → the one-tap attendance signal feeding group health;
--     UNIQUE(group_id, user_id, checkin_date) makes check-in idempotent per day
--   * goal_completed_at       → the completion metric ("% of groups that complete
--     their stated goal") is derived from these columns by backend/groups/completion.ts

-- 1. Goal columns on study_groups
ALTER TABLE public.study_groups
  ADD COLUMN IF NOT EXISTS goal              TEXT,
  ADD COLUMN IF NOT EXISTS target_end_date   DATE,
  ADD COLUMN IF NOT EXISTS goal_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS progress_pct      INTEGER NOT NULL DEFAULT 0
    CHECK (progress_pct BETWEEN 0 AND 100);

-- 2. Recurring meeting slots
CREATE TABLE IF NOT EXISTS public.group_meetings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday
  start_time  TIME NOT NULL,
  frequency   TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('weekly', 'biweekly')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (group_id, day_of_week, start_time)
);

-- 3. One-tap daily check-ins
CREATE TABLE IF NOT EXISTS public.group_checkins (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id     UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (group_id, user_id, checkin_date)
);

CREATE INDEX IF NOT EXISTS idx_group_meetings_group ON public.group_meetings(group_id);
CREATE INDEX IF NOT EXISTS idx_group_checkins_group ON public.group_checkins(group_id, checkin_date DESC);
CREATE INDEX IF NOT EXISTS idx_group_checkins_user  ON public.group_checkins(user_id, checkin_date DESC);

-- 4. RLS — same style as 011 (my_group_ids() SECURITY DEFINER helper).
--    API routes use the service client after explicit membership checks;
--    these policies are defense-in-depth consistent with sibling tables.
ALTER TABLE public.group_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read meetings" ON public.group_meetings
  FOR SELECT USING (group_id IN (SELECT public.my_group_ids()));

CREATE POLICY "Owner manages meetings" ON public.group_meetings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.study_groups g
      WHERE g.id = group_id AND g.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.study_groups g
      WHERE g.id = group_id AND g.owner_id = auth.uid()
    )
  );

CREATE POLICY "Members read checkins" ON public.group_checkins
  FOR SELECT USING (group_id IN (SELECT public.my_group_ids()));

CREATE POLICY "Members insert own checkin" ON public.group_checkins
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND group_id IN (SELECT public.my_group_ids())
  );
