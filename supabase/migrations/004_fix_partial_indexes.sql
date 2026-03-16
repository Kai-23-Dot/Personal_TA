-- ============================================================
-- Migration 004: Replace partial indexes with non-partial ones
--
-- ROOT CAUSE: Supabase's upsert with onConflict: "col1,col2,col3"
-- generates: ON CONFLICT (col1, col2, col3) DO UPDATE ...
-- PostgreSQL only matches non-partial (unconditional) unique indexes
-- for this syntax. A partial index (WHERE col IS NOT NULL) is IGNORED,
-- causing "no unique constraint matching ON CONFLICT" (error 42P10).
--
-- FIX: Non-partial indexes are fine — PostgreSQL treats NULL as distinct
-- in unique indexes, so rows with NULL platform_id never conflict.
-- ============================================================

-- assignments: drop partial, create non-partial
DROP INDEX IF EXISTS public.idx_assignments_user_course_platform;
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_user_course_platform
  ON public.assignments(user_id, course_id, platform_id);

-- notes: drop partial, create non-partial
DROP INDEX IF EXISTS public.idx_notes_user_source_file;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_user_source_file
  ON public.notes(user_id, source_file_id);

-- grade_events: drop partial, create non-partial
DROP INDEX IF EXISTS public.idx_grade_events_submission;
CREATE UNIQUE INDEX IF NOT EXISTS idx_grade_events_submission
  ON public.grade_events(submission_id);
