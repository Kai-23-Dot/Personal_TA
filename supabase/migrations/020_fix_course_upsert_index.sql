-- Supabase upsert with onConflict: "user_id,connection_id,platform_id"
-- emits an unqualified ON CONFLICT target. PostgreSQL cannot use the previous
-- partial index for that target, so current Canvas courses failed to import.
-- NULL values remain distinct in an ordinary unique index, so the non-partial
-- version preserves manually created courses while supporting LMS upserts.
DROP INDEX IF EXISTS public.idx_courses_user_conn_platform_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_user_conn_platform_id
  ON public.courses(user_id, connection_id, platform_id);
