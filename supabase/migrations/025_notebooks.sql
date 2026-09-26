-- Notebooks: a place to gather sources that are not Canvas coursework.
--
-- Everything the app indexes today arrives from an LMS sync, so notes are
-- reachable only through the course they belong to. A student preparing for a
-- standardised test, reading around a subject, or working from a lecture
-- recording has nowhere to put that material.
--
-- A notebook is a named collection of sources. It may point at a course, in
-- which case anything generated from it (study guides, practice, flashcards)
-- lands in that course's existing surfaces; left null, the notebook simply
-- stands on its own.

CREATE TABLE IF NOT EXISTS public.notebooks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Optional: when set, generated material is attributed to this course.
  -- ON DELETE SET NULL so removing a course empties the link but keeps the
  -- notebook and every source the student put in it.
  course_id   UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notebooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notebooks" ON public.notebooks
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS notebooks_user_idx
  ON public.notebooks (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS set_notebooks_updated_at ON public.notebooks;
CREATE TRIGGER set_notebooks_updated_at
  BEFORE UPDATE ON public.notebooks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- A source belongs to at most one notebook. Null keeps every existing note
-- exactly where it is: reachable through its course, as before.
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS notebook_id UUID REFERENCES public.notebooks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS notes_notebook_idx
  ON public.notes (notebook_id, created_at DESC)
  WHERE notebook_id IS NOT NULL;

-- Sources can now arrive as a link rather than a file.
ALTER TABLE public.notes
  DROP CONSTRAINT IF EXISTS notes_source_type_check;

ALTER TABLE public.notes
  ADD CONSTRAINT notes_source_type_check
  CHECK (source_type IN (
    'upload', 'google_drive', 'onedrive', 'manual', 'canvas',
    'url',      -- a web page the student pasted
    'youtube'   -- a video, stored as its transcript
  ));

-- file_type described uploaded documents only. Audio and video were already
-- accepted by the uploader and landed as 'other', and links had no honest
-- value at all.
ALTER TABLE public.notes
  DROP CONSTRAINT IF EXISTS notes_file_type_check;

ALTER TABLE public.notes
  ADD CONSTRAINT notes_file_type_check
  CHECK (file_type IN (
    'pdf', 'docx', 'pptx', 'txt', 'md', 'image',
    'audio', 'video', 'link',
    'other'
  ));

COMMENT ON TABLE public.notebooks IS
  'A student-created collection of imported sources. course_id is optional; when set, material generated from the notebook is attributed to that course.';

COMMENT ON COLUMN public.notes.notebook_id IS
  'Notebook this source belongs to. Null for Canvas-synced notes, which are reached through their course.';
