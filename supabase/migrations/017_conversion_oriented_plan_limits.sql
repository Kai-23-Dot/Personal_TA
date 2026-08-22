-- ============================================================
-- Smartlearn — Migration 017: Conversion-oriented plan limits
-- ============================================================
-- Keep the database's concurrency-safe AI ceilings aligned with the reduced
-- allowances in backend/billing/plans.ts.

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
