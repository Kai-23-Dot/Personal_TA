-- ============================================================
-- Smartlearn — Migration 017: Four-tier, cost-weighted billing
-- ============================================================

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'plus', 'pro', 'max'));

ALTER TABLE public.note_summaries
  ALTER COLUMN model_used SET DEFAULT 'gpt-4.1-mini';

ALTER TABLE public.usage_events
  DROP CONSTRAINT IF EXISTS usage_events_kind_check;
ALTER TABLE public.usage_events
  ADD CONSTRAINT usage_events_kind_check
  CHECK (kind IN (
    'tokens',
    'practice_test',
    'note',
    'ai_credits',
    'audio_seconds'
  ));

CREATE OR REPLACE FUNCTION public.sync_stripe_subscription(
  p_event_id TEXT,
  p_event_type TEXT,
  p_event_created_at TIMESTAMPTZ,
  p_customer_id TEXT,
  p_subscription_id TEXT,
  p_subscription_status TEXT,
  p_plan TEXT,
  p_current_period_end TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_event_id TEXT;
  updated_profile_id UUID;
BEGIN
  IF p_plan NOT IN ('free', 'plus', 'pro', 'max') THEN
    RAISE EXCEPTION 'Invalid billing plan';
  END IF;

  INSERT INTO public.stripe_webhook_events (
    event_id,
    event_type,
    event_created_at,
    processing_result
  )
  VALUES (p_event_id, p_event_type, p_event_created_at, 'processed')
  ON CONFLICT (event_id) DO NOTHING
  RETURNING event_id INTO inserted_event_id;

  IF inserted_event_id IS NULL THEN
    RETURN 'duplicate';
  END IF;

  UPDATE public.profiles
  SET
    plan = p_plan,
    subscription_status = p_subscription_status,
    stripe_subscription_id = p_subscription_id,
    current_period_end = p_current_period_end,
    stripe_event_created_at = p_event_created_at
  WHERE stripe_customer_id = p_customer_id
    AND (
      stripe_event_created_at IS NULL
      OR stripe_event_created_at <= p_event_created_at
    )
  RETURNING id INTO updated_profile_id;

  IF updated_profile_id IS NOT NULL THEN
    RETURN 'processed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE stripe_customer_id = p_customer_id
  ) THEN
    UPDATE public.stripe_webhook_events
    SET processing_result = 'stale'
    WHERE event_id = p_event_id;
    RETURN 'stale';
  END IF;

  UPDATE public.stripe_webhook_events
  SET processing_result = 'ignored'
  WHERE event_id = p_event_id;
  RETURN 'ignored';
END;
$$;

REVOKE ALL ON FUNCTION public.sync_stripe_subscription(
  TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_stripe_subscription(
  TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) TO service_role;

DROP FUNCTION IF EXISTS public.get_billing_usage(UUID);
CREATE FUNCTION public.get_billing_usage(p_user_id UUID)
RETURNS TABLE (
  effective_plan TEXT,
  practice_tests BIGINT,
  notes BIGINT,
  ai_credits BIGINT,
  audio_seconds BIGINT,
  storage_bytes BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN p.plan IN ('plus', 'pro', 'max')
        AND p.subscription_status IN ('active', 'trialing')
      THEN p.plan
      ELSE 'free'
    END AS effective_plan,
    (
      SELECT COUNT(*)
      FROM public.practice_sessions ps
      WHERE ps.user_id = p_user_id
        AND ps.created_at >= NOW() - INTERVAL '30 days'
    ) AS practice_tests,
    (
      SELECT COUNT(*)
      FROM public.notes n
      WHERE n.user_id = p_user_id
        AND n.created_at >= NOW() - INTERVAL '30 days'
    ) AS notes,
    (
      SELECT COALESCE(SUM(ue.amount), 0)
      FROM public.usage_events ue
      WHERE ue.user_id = p_user_id
        AND ue.kind = 'ai_credits'
        AND ue.created_at >= NOW() - INTERVAL '30 days'
    ) AS ai_credits,
    (
      SELECT COALESCE(SUM(ue.amount), 0)
      FROM public.usage_events ue
      WHERE ue.user_id = p_user_id
        AND ue.kind = 'audio_seconds'
        AND ue.created_at >= NOW() - INTERVAL '30 days'
    ) AS audio_seconds,
    (
      SELECT COALESCE(SUM(n.file_size_bytes), 0)
      FROM public.notes n
      WHERE n.user_id = p_user_id
    ) AS storage_bytes
  FROM public.profiles p
  WHERE p.id = p_user_id;
$$;
REVOKE ALL ON FUNCTION public.get_billing_usage(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_usage(UUID) TO service_role;

-- Reserve a conservative number of AI credits before each provider call. The
-- application records a signed adjustment after the provider reports actual
-- input/output usage. The advisory lock prevents concurrent requests from
-- spending the same remaining credits.
CREATE OR REPLACE FUNCTION public.reserve_ai_credits(
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS TABLE (
  allowed BOOLEAN,
  effective_plan TEXT,
  credit_limit INTEGER,
  credits_used BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_plan TEXT;
  resolved_limit INTEGER;
  resolved_used BIGINT;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Reservation amount must be positive';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  SELECT CASE
    WHEN p.plan IN ('plus', 'pro', 'max')
      AND p.subscription_status IN ('active', 'trialing')
    THEN p.plan
    ELSE 'free'
  END
  INTO resolved_plan
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF resolved_plan IS NULL THEN
    RAISE EXCEPTION 'Billing profile was not found';
  END IF;

  resolved_limit := CASE resolved_plan
    WHEN 'plus' THEN 600
    WHEN 'pro' THEN 3000
    WHEN 'max' THEN 8000
    ELSE 100
  END;

  SELECT COALESCE(SUM(ue.amount), 0)
  INTO resolved_used
  FROM public.usage_events ue
  WHERE ue.user_id = p_user_id
    AND ue.kind = 'ai_credits'
    AND ue.created_at >= NOW() - INTERVAL '30 days';

  IF resolved_used + p_amount > resolved_limit THEN
    RETURN QUERY SELECT FALSE, resolved_plan, resolved_limit, resolved_used;
    RETURN;
  END IF;

  INSERT INTO public.usage_events (user_id, kind, amount)
  VALUES (p_user_id, 'ai_credits', p_amount);

  RETURN QUERY
  SELECT TRUE, resolved_plan, resolved_limit, resolved_used + p_amount;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_credits(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_credits(UUID, INTEGER)
  TO service_role;
