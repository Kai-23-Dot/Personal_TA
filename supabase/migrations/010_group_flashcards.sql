-- ============================================================
-- Migration 010: Group flashcard sharing + chapter assignments
-- ============================================================

-- Flashcard decks shared inside a study group
CREATE TABLE IF NOT EXISTS public.group_shared_flashcards (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id        UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,                            -- deck label (e.g. "Chapter 3 – Cell Division")
  flashcard_ids   UUID[] NOT NULL DEFAULT '{}',            -- IDs of flashcards in the deck
  shared_by       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id       UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  chapter         TEXT,                                     -- optional chapter label
  shared_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.group_shared_flashcards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view shared flashcard decks" ON public.group_shared_flashcards
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Group members can share flashcard decks" ON public.group_shared_flashcards
  FOR INSERT WITH CHECK (
    shared_by = auth.uid() AND
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Owner can delete shared decks" ON public.group_shared_flashcards
  FOR DELETE USING (shared_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_group_shared_flashcards_group
  ON public.group_shared_flashcards(group_id, shared_at DESC);

-- Track assignment coverage per member (which chapter each person "owns")
CREATE TABLE IF NOT EXISTS public.group_chapter_assignments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id        UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chapter         TEXT NOT NULL,
  description     TEXT,
  assigned_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (group_id, user_id, chapter)
);

ALTER TABLE public.group_chapter_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Group members can manage chapter assignments" ON public.group_chapter_assignments
  USING (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_group_chapter_assignments_group
  ON public.group_chapter_assignments(group_id);
