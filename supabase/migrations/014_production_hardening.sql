-- Production hardening:
--   * vector-search RPCs may no longer bypass RLS for an arbitrary user UUID
--   * quiz attempts are course/topic aware and idempotent per session question
--   * performance metrics aggregate atomically per user/course/topic

CREATE OR REPLACE FUNCTION public.match_notes(
  query_embedding vector(1536),
  match_user_id UUID,
  match_count INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  course_id UUID,
  similarity FLOAT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    n.id,
    n.title,
    n.content,
    n.course_id,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM public.notes n
  WHERE n.user_id = match_user_id
    AND (auth.uid() = match_user_id OR auth.role() = 'service_role')
    AND n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding) > similarity_threshold
  ORDER BY n.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 50);
$$;

CREATE OR REPLACE FUNCTION public.match_summaries(
  query_embedding vector(1536),
  match_user_id UUID,
  match_count INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  note_id UUID,
  course_id UUID,
  similarity FLOAT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.content,
    s.note_id,
    s.course_id,
    1 - (s.embedding <=> query_embedding) AS similarity
  FROM public.note_summaries s
  WHERE s.user_id = match_user_id
    AND (auth.uid() = match_user_id OR auth.role() = 'service_role')
    AND s.embedding IS NOT NULL
    AND 1 - (s.embedding <=> query_embedding) > similarity_threshold
  ORDER BY s.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 50);
$$;

REVOKE ALL ON FUNCTION public.match_notes(vector, UUID, INT, FLOAT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_summaries(vector, UUID, INT, FLOAT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_notes(vector, UUID, INT, FLOAT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_summaries(vector, UUID, INT, FLOAT)
  TO authenticated, service_role;

ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS topic TEXT;

UPDATE public.quiz_attempts qa
SET
  course_id = ps.course_id,
  topic = ps.topic
FROM public.practice_sessions ps
WHERE qa.session_id = ps.id
  AND (qa.course_id IS NULL OR qa.topic IS NULL);

-- Preserve the latest record if older application versions submitted a
-- completed session more than once.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY session_id, question_index
      ORDER BY created_at DESC, id DESC
    ) AS duplicate_rank
  FROM public.quiz_attempts
  WHERE session_id IS NOT NULL
)
DELETE FROM public.quiz_attempts
WHERE id IN (SELECT id FROM ranked WHERE duplicate_rank > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_attempts_session_question
  ON public.quiz_attempts(session_id, question_index)
  WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_adaptive
  ON public.quiz_attempts(user_id, course_id, topic, created_at DESC);

ALTER TABLE public.quiz_attempts
  DROP CONSTRAINT IF EXISTS quiz_attempts_question_index_nonnegative,
  ADD CONSTRAINT quiz_attempts_question_index_nonnegative
    CHECK (question_index >= 0) NOT VALID,
  DROP CONSTRAINT IF EXISTS quiz_attempts_time_nonnegative,
  ADD CONSTRAINT quiz_attempts_time_nonnegative
    CHECK (time_taken_seconds >= 0) NOT VALID;

DROP INDEX IF EXISTS public.idx_perf_metrics_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_perf_metrics_unique
  ON public.performance_metrics(
    user_id,
    (COALESCE(course_id, '00000000-0000-0000-0000-000000000000'::UUID)),
    topic,
    (COALESCE(subtopic, ''))
  );

CREATE OR REPLACE FUNCTION public.record_performance_metric(
  metric_user_id UUID,
  metric_course_id UUID,
  metric_topic TEXT,
  session_correct INT,
  session_total INT,
  metric_subtopic TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM metric_user_id
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF metric_topic IS NULL OR LENGTH(BTRIM(metric_topic)) = 0
     OR session_total <= 0
     OR session_correct < 0
     OR session_correct > session_total THEN
    RAISE EXCEPTION 'Invalid performance metric';
  END IF;

  INSERT INTO public.performance_metrics (
    user_id,
    course_id,
    topic,
    subtopic,
    attempts,
    correct,
    accuracy_pct,
    last_practiced,
    mastery_level
  )
  VALUES (
    metric_user_id,
    metric_course_id,
    BTRIM(metric_topic),
    NULLIF(BTRIM(metric_subtopic), ''),
    session_total,
    session_correct,
    ROUND((session_correct::NUMERIC / session_total::NUMERIC) * 100, 2),
    NOW(),
    CASE
      WHEN (session_correct::NUMERIC / session_total::NUMERIC) >= 0.85 THEN 'mastered'
      WHEN (session_correct::NUMERIC / session_total::NUMERIC) >= 0.65 THEN 'practicing'
      ELSE 'learning'
    END
  )
  ON CONFLICT (
    user_id,
    (COALESCE(course_id, '00000000-0000-0000-0000-000000000000'::UUID)),
    topic,
    (COALESCE(subtopic, ''))
  )
  DO UPDATE SET
    attempts = public.performance_metrics.attempts + EXCLUDED.attempts,
    correct = public.performance_metrics.correct + EXCLUDED.correct,
    accuracy_pct = ROUND(
      (
        (public.performance_metrics.correct + EXCLUDED.correct)::NUMERIC
        / (public.performance_metrics.attempts + EXCLUDED.attempts)::NUMERIC
      ) * 100,
      2
    ),
    last_practiced = NOW(),
    mastery_level = CASE
      WHEN (
        (public.performance_metrics.correct + EXCLUDED.correct)::NUMERIC
        / (public.performance_metrics.attempts + EXCLUDED.attempts)::NUMERIC
      ) >= 0.85 THEN 'mastered'
      WHEN (
        (public.performance_metrics.correct + EXCLUDED.correct)::NUMERIC
        / (public.performance_metrics.attempts + EXCLUDED.attempts)::NUMERIC
      ) >= 0.65 THEN 'practicing'
      ELSE 'learning'
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.record_performance_metric(UUID, UUID, TEXT, INT, INT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_performance_metric(UUID, UUID, TEXT, INT, INT, TEXT)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_practice_session(
  submit_user_id UUID,
  submit_session_id UUID,
  submitted_attempts JSONB,
  submitted_duration_seconds INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  target_session public.practice_sessions%ROWTYPE;
  total_attempts INT;
  correct_attempts INT;
BEGIN
  IF auth.uid() IS DISTINCT FROM submit_user_id
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF jsonb_typeof(submitted_attempts) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Attempts must be an array';
  END IF;
  IF submitted_duration_seconds IS NOT NULL
     AND (submitted_duration_seconds < 0 OR submitted_duration_seconds > 86400) THEN
    RAISE EXCEPTION 'Duration is invalid';
  END IF;

  SELECT *
  INTO target_session
  FROM public.practice_sessions
  WHERE id = submit_session_id
    AND user_id = submit_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Practice session not found';
  END IF;
  IF target_session.status = 'completed' THEN
    RETURN jsonb_build_object(
      'already_completed', TRUE,
      'correct', target_session.correct_count,
      'total', target_session.question_count
    );
  END IF;
  IF target_session.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Practice session cannot be submitted';
  END IF;
  IF jsonb_array_length(submitted_attempts) <> target_session.question_count THEN
    RAISE EXCEPTION 'Every question must have exactly one attempt';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(submitted_attempts)
      AS attempt(question_index INT, user_answer TEXT, time_taken_seconds INT)
    WHERE question_index IS NULL
       OR question_index < 0
       OR question_index >= target_session.question_count
       OR user_answer IS NULL
       OR LENGTH(user_answer) > 10000
       OR COALESCE(time_taken_seconds, 0) < 0
       OR COALESCE(time_taken_seconds, 0) > 86400
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(submitted_attempts)
      AS attempt(question_index INT, user_answer TEXT, time_taken_seconds INT)
    GROUP BY question_index
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Attempts are invalid';
  END IF;

  INSERT INTO public.quiz_attempts (
    user_id,
    session_id,
    course_id,
    topic,
    question_index,
    user_answer,
    is_correct,
    time_taken_seconds
  )
  SELECT
    submit_user_id,
    submit_session_id,
    target_session.course_id,
    target_session.topic,
    attempt.question_index,
    attempt.user_answer,
    LOWER(BTRIM(question.value->>'correct_answer')) =
      LOWER(BTRIM(attempt.user_answer)),
    COALESCE(attempt.time_taken_seconds, 0)
  FROM jsonb_to_recordset(submitted_attempts)
    AS attempt(question_index INT, user_answer TEXT, time_taken_seconds INT)
  CROSS JOIN LATERAL jsonb_array_element(
    target_session.questions,
    attempt.question_index
  ) AS question(value);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_correct)
  INTO total_attempts, correct_attempts
  FROM public.quiz_attempts
  WHERE session_id = submit_session_id
    AND user_id = submit_user_id;

  IF total_attempts <> target_session.question_count THEN
    RAISE EXCEPTION 'Practice attempts could not be recorded';
  END IF;

  UPDATE public.practice_sessions
  SET
    correct_count = correct_attempts,
    status = 'completed',
    completed_at = NOW(),
    duration_seconds = submitted_duration_seconds
  WHERE id = submit_session_id
    AND user_id = submit_user_id;

  PERFORM public.record_performance_metric(
    submit_user_id,
    target_session.course_id,
    target_session.topic,
    correct_attempts,
    total_attempts,
    NULL
  );

  RETURN jsonb_build_object(
    'already_completed', FALSE,
    'correct', correct_attempts,
    'total', total_attempts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_practice_session(UUID, UUID, JSONB, INT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_practice_session(UUID, UUID, JSONB, INT)
  TO authenticated, service_role;

-- Private note uploads. Every object path begins with the authenticated user UUID.
INSERT INTO storage.buckets (id, name, public)
VALUES ('notes', 'notes', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

DROP POLICY IF EXISTS "Users read own note files" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own note files" ON storage.objects;
DROP POLICY IF EXISTS "Users update own note files" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own note files" ON storage.objects;

CREATE POLICY "Users read own note files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'notes'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );
CREATE POLICY "Users upload own note files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'notes'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );
CREATE POLICY "Users update own note files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'notes'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  )
  WITH CHECK (
    bucket_id = 'notes'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );
CREATE POLICY "Users delete own note files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'notes'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_event_created_at TIMESTAMPTZ;
DROP INDEX IF EXISTS public.idx_profiles_stripe_customer_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON public.profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.disconnect_lms_connection(
  disconnect_user_id UUID,
  disconnect_connection_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM disconnect_user_id
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.lms_connections
    WHERE id = disconnect_connection_id
      AND user_id = disconnect_user_id
  ) THEN
    RAISE EXCEPTION 'Connection not found';
  END IF;

  UPDATE public.courses
  SET is_active = FALSE
  WHERE connection_id = disconnect_connection_id
    AND user_id = disconnect_user_id;

  UPDATE public.lms_connections
  SET is_active = FALSE
  WHERE id = disconnect_connection_id
    AND user_id = disconnect_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.disconnect_lms_connection(UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disconnect_lms_connection(UUID, UUID)
  TO authenticated, service_role;
