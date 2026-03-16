-- ============================================================
-- Migration 005: Add Infinite Campus as a supported LMS platform
-- Run in Supabase SQL Editor
-- ============================================================

-- Add 'infinite_campus' to the platform CHECK constraint on lms_connections
ALTER TABLE public.lms_connections
  DROP CONSTRAINT IF EXISTS lms_connections_platform_check;

ALTER TABLE public.lms_connections
  ADD CONSTRAINT lms_connections_platform_check
  CHECK (platform IN ('google_classroom', 'canvas', 'microsoft_teams', 'infinite_campus'));

-- Add 'infinite_campus' to the platform CHECK constraint on courses
ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_platform_check;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_platform_check
  CHECK (platform IN ('google_classroom', 'canvas', 'microsoft_teams', 'manual', 'infinite_campus'));
