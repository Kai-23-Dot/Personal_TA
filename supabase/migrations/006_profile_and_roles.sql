-- ============================================================
-- PersonalTA.ai — Migration 006: Profile fields + roles
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_subjects TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student' CHECK (role IN ('student', 'teacher'));

-- Backfill role if null
UPDATE public.profiles
SET role = 'student'
WHERE role IS NULL;
