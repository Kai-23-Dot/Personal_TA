-- ============================================================
-- 002_grade_sync.sql
-- Adds unique indexes needed for upsert-based grade syncing.
-- Run this in Supabase SQL Editor after 001_initial.sql.
-- ============================================================

-- One submission row per user per assignment (latest grade wins on re-sync).
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_user_assignment
  ON public.submissions(user_id, assignment_id);

-- One grade_event per linked submission (prevents duplicate rows on re-sync).
-- Partial index: only applies when submission_id is set, so manual grade_events
-- (without a submission_id) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_grade_events_submission
  ON public.grade_events(submission_id)
  WHERE submission_id IS NOT NULL;
