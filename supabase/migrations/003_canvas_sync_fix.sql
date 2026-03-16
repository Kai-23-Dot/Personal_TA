-- ============================================================
-- Migration 003: Fix Canvas sync + Canvas pages as notes
-- Run in Supabase SQL Editor
-- ============================================================

-- Fix: assignments upsert requires a unique constraint on (user_id, course_id, platform_id).
-- Without this, every ON CONFLICT clause throws a PostgreSQL error → 0 assignments synced.
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_user_course_platform
  ON public.assignments(user_id, course_id, platform_id)
  WHERE platform_id IS NOT NULL;

-- Fix: expand notes source_type to allow 'canvas' (for Canvas Pages sync)
ALTER TABLE public.notes
  DROP CONSTRAINT IF EXISTS notes_source_type_check;

ALTER TABLE public.notes
  ADD CONSTRAINT notes_source_type_check
  CHECK (source_type IN ('upload', 'google_drive', 'onedrive', 'manual', 'canvas'));

-- Add unique index on notes so Canvas page upserts don't create duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_user_source_file
  ON public.notes(user_id, source_file_id)
  WHERE source_file_id IS NOT NULL;
