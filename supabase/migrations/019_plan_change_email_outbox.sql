-- ============================================================
-- Smartlearn — Migration 019: Transactional plan-change email outbox
-- ============================================================
-- Record a notification in the same transaction that applies a Stripe plan
-- change. The webhook can then retry delivery without losing the transition or
-- sending a second message for the same Stripe event.

CREATE TABLE IF NOT EXISTS public.billing_plan_email_notifications (
  event_id TEXT PRIMARY KEY
    REFERENCES public.stripe_webhook_events(event_id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  previous_plan TEXT NOT NULL
    CHECK (previous_plan IN ('free', 'plus', 'pro', 'max')),
  new_plan TEXT NOT NULL
    CHECK (new_plan IN ('free', 'plus', 'pro', 'max')),
  event_created_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  provider_message_id TEXT,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_plan_email_notifications_pending
  ON public.billing_plan_email_notifications (created_at)
  WHERE sent_at IS NULL;

ALTER TABLE public.billing_plan_email_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.billing_plan_email_notifications
  FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.billing_plan_email_notifications
  TO service_role;

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
  profile_id UUID;
  profile_email TEXT;
  profile_name TEXT;
  previous_plan TEXT;
  previous_event_created_at TIMESTAMPTZ;
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

  -- Serialize subscription changes for one profile so the email always names
  -- the plan that was actually active immediately before this event.
  SELECT p.id, p.email, p.full_name, p.plan, p.stripe_event_created_at
  INTO profile_id, profile_email, profile_name, previous_plan,
    previous_event_created_at
  FROM public.profiles p
  WHERE p.stripe_customer_id = p_customer_id
  FOR UPDATE;

  IF profile_id IS NULL THEN
    UPDATE public.stripe_webhook_events
    SET processing_result = 'ignored'
    WHERE event_id = p_event_id;
    RETURN 'ignored';
  END IF;

  IF previous_event_created_at IS NOT NULL
    AND previous_event_created_at > p_event_created_at THEN
    UPDATE public.stripe_webhook_events
    SET processing_result = 'stale'
    WHERE event_id = p_event_id;
    RETURN 'stale';
  END IF;

  UPDATE public.profiles
  SET
    plan = p_plan,
    subscription_status = p_subscription_status,
    stripe_subscription_id = p_subscription_id,
    current_period_end = p_current_period_end,
    stripe_event_created_at = p_event_created_at
  WHERE id = profile_id;

  IF previous_plan IS DISTINCT FROM p_plan AND profile_email IS NOT NULL THEN
    INSERT INTO public.billing_plan_email_notifications (
      event_id,
      user_id,
      recipient_email,
      recipient_name,
      previous_plan,
      new_plan,
      event_created_at
    )
    VALUES (
      p_event_id,
      profile_id,
      profile_email,
      profile_name,
      previous_plan,
      p_plan,
      p_event_created_at
    )
    ON CONFLICT (event_id) DO NOTHING;
  END IF;

  RETURN 'processed';
END;
$$;

REVOKE ALL ON FUNCTION public.sync_stripe_subscription(
  TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_stripe_subscription(
  TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
) TO service_role;
