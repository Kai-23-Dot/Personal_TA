-- ============================================================
-- PersonalTA.ai — Migration 007: Notes metadata & extractions
-- ============================================================

-- Extend notes metadata (unit/exam) and file types
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS unit_name TEXT,
  ADD COLUMN IF NOT EXISTS exam_name TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notes_file_type_check'
  ) THEN
    ALTER TABLE public.notes DROP CONSTRAINT notes_file_type_check;
  END IF;
END $$;

ALTER TABLE public.notes
  ADD CONSTRAINT notes_file_type_check
  CHECK (file_type IN ('pdf','docx','pptx','txt','md','image','audio','other'));

CREATE INDEX IF NOT EXISTS idx_notes_unit_name ON public.notes(user_id, unit_name);
CREATE INDEX IF NOT EXISTS idx_notes_exam_name ON public.notes(user_id, exam_name);

-- AI extractions for notes
CREATE TABLE IF NOT EXISTS public.note_extractions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note_id         UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  key_concepts    TEXT[] DEFAULT '{}',
  formulas        TEXT[] DEFAULT '{}',
  definitions     JSONB DEFAULT '[]'::jsonb, -- [{term, definition}]
  examples        TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, note_id)
);

ALTER TABLE public.note_extractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own note_extractions" ON public.note_extractions
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_note_extractions_note_id ON public.note_extractions(note_id);

CREATE TRIGGER set_note_extractions_updated_at
  BEFORE UPDATE ON public.note_extractions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
