-- ============================================================
-- Smartlearn — Migration 021: Repair production billing runtime
-- ============================================================
-- Migration 016 was applied to production before the four-tier billing SQL
-- reached its current form. Re-apply the runtime schema explicitly so older
-- projects receive the same constraints and concurrency-safe credit RPCs.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'plus', 'pro', 'max'));

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
