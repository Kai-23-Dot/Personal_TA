-- ============================================================
-- Conlearn — Migration 015: Stripe reliability + usage aggregation
-- ============================================================

-- Stripe can retry or deliver webhook events out of order. Keep an event ledger
-- and apply subscription state plus the ledger entry in one transaction.
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_created_at TIMESTAMPTZ NOT NULL,
  processing_result TEXT NOT NULL DEFAULT 'processed'
    CHECK (processing_result IN ('processed', 'duplicate', 'stale', 'ignored')),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stripe_webhook_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.stripe_webhook_events TO service_role;

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
  IF p_plan NOT IN ('free', 'pro') THEN
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
    SELECT 1
    FROM public.profiles
    WHERE stripe_customer_id = p_customer_id
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

-- Aggregate all billing usage in Postgres. This avoids transferring every
-- token event to the application and reduces the billing status endpoint to a
-- single database round trip.
CREATE OR REPLACE FUNCTION public.get_billing_usage(p_user_id UUID)
RETURNS TABLE (
  effective_plan TEXT,
  practice_tests BIGINT,
  notes BIGINT,
  tokens BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN p.plan = 'pro'
        AND p.subscription_status IN ('active', 'trialing')
      THEN 'pro'
      ELSE 'free'
    END AS effective_plan,
    (
      SELECT COUNT(*)
      FROM public.practice_sessions ps
      WHERE ps.user_id = p_user_id
        AND ps.created_at >= NOW() - INTERVAL '7 days'
    ) AS practice_tests,
    (
      SELECT COUNT(*)
      FROM public.notes n
      WHERE n.user_id = p_user_id
        AND n.created_at >= NOW() - INTERVAL '7 days'
    ) AS notes,
    (
      SELECT COALESCE(SUM(ue.amount), 0)
      FROM public.usage_events ue
      WHERE ue.user_id = p_user_id
        AND ue.kind = 'tokens'
        AND ue.created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    ) AS tokens
  FROM public.profiles p
  WHERE p.id = p_user_id;
$$;
REVOKE ALL ON FUNCTION public.get_billing_usage(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_usage(UUID) TO service_role;
