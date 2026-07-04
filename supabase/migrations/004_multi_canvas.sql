-- 004_multi_canvas.sql
-- Allow multiple Canvas accounts per user (one per domain) and fix
-- course uniqueness so the same Canvas course ID from two different
-- institutions doesn't conflict.

-- ── lms_connections ──────────────────────────────────────────────────────────

-- Drop the old single-platform-per-user constraint
ALTER TABLE public.lms_connections
  DROP CONSTRAINT IF EXISTS lms_connections_user_id_platform_key;

-- Non-Canvas platforms (Google Classroom, Microsoft Teams) remain one per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_lms_conn_noncanvas_unique
  ON public.lms_connections(user_id, platform)
  WHERE platform != 'canvas';

-- Canvas connections: one per user per institution domain
CREATE UNIQUE INDEX IF NOT EXISTS idx_lms_conn_canvas_domain_unique
  ON public.lms_connections(user_id, canvas_domain)
  WHERE platform = 'canvas' AND canvas_domain IS NOT NULL;

-- ── courses ──────────────────────────────────────────────────────────────────

-- Drop old constraint that used (user_id, platform, platform_id).
-- With multiple Canvas accounts the same platform_id could appear from
-- different institutions — the connection_id is the correct scope.
ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_user_id_platform_platform_id_key;

-- New constraint: unique per connection (institution) + platform course ID.
-- Partial so it only applies to LMS-sourced rows (both columns non-null).
CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_user_conn_platform_id
  ON public.courses(user_id, connection_id, platform_id)
  WHERE connection_id IS NOT NULL AND platform_id IS NOT NULL;
