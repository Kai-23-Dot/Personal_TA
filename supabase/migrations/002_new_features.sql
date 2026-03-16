-- ============================================================
-- PersonalTA.ai — Migration 002: Flashcards, GPA, Study Groups
-- ============================================================

-- ============================================================
-- FLASHCARDS (Spaced Repetition System)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.flashcards (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id       UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  note_id         UUID REFERENCES public.notes(id) ON DELETE SET NULL,
  front           TEXT NOT NULL,
  back            TEXT NOT NULL,
  hint            TEXT,
  topic           TEXT NOT NULL,
  difficulty      TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  -- SRS fields (SM-2 algorithm)
  interval_days   INTEGER DEFAULT 1,
  ease_factor     NUMERIC(4, 2) DEFAULT 2.5,
  repetitions     INTEGER DEFAULT 0,
  next_review     TIMESTAMPTZ DEFAULT NOW(),
  last_reviewed   TIMESTAMPTZ,
  times_correct   INTEGER DEFAULT 0,
  times_reviewed  INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own flashcards" ON public.flashcards
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_flashcards_user_id ON public.flashcards(user_id);
CREATE INDEX idx_flashcards_next_review ON public.flashcards(user_id, next_review);
CREATE INDEX idx_flashcards_course_id ON public.flashcards(course_id);

CREATE TRIGGER set_flashcards_updated_at BEFORE UPDATE ON public.flashcards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- STUDY GROUPS
-- Create table + owner policy first. The member-visibility
-- policy is added AFTER group_members is created below.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.study_groups (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  course_id       UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  invite_code     TEXT UNIQUE NOT NULL DEFAULT UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 8)),
  is_public       BOOLEAN DEFAULT FALSE,
  max_members     INTEGER DEFAULT 10,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.study_groups ENABLE ROW LEVEL SECURITY;

-- Owner can do everything
CREATE POLICY "Owner manages own groups" ON public.study_groups
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER set_study_groups_updated_at BEFORE UPDATE ON public.study_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- GROUP MEMBERS (must exist before study_groups member policy)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.group_members (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id        UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role            TEXT DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see group membership" ON public.group_members
  FOR SELECT USING (
    user_id = auth.uid() OR
    group_id IN (SELECT group_id FROM public.group_members gm WHERE gm.user_id = auth.uid())
  );
CREATE POLICY "Users manage own membership" ON public.group_members
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can leave groups" ON public.group_members
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX idx_group_members_user_id ON public.group_members(user_id);
CREATE INDEX idx_group_members_group_id ON public.group_members(group_id);

-- Now safe to add the member-visibility policy on study_groups
CREATE POLICY "Members can view their groups" ON public.study_groups
  FOR SELECT USING (
    id IN (
      SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- GROUP MESSAGES (Realtime chat)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.group_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id        UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  message_type    TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'note_share', 'quiz_share', 'system')),
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Group members can read messages" ON public.group_messages
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Group members can send messages" ON public.group_messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE INDEX idx_group_messages_group_id ON public.group_messages(group_id, created_at);

-- Enable realtime for group_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;

-- ============================================================
-- SHARED NOTES (group note sharing)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.group_shared_notes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id        UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  note_id         UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  shared_by       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (group_id, note_id)
);

ALTER TABLE public.group_shared_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Group members can view shared notes" ON public.group_shared_notes
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Group members can share notes" ON public.group_shared_notes
  FOR INSERT WITH CHECK (
    shared_by = auth.uid() AND
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE INDEX idx_group_shared_notes_group ON public.group_shared_notes(group_id);
