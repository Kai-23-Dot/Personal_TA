-- ============================================================
-- Conlearn — Migration 012: Stripe billing + usage metering
-- ============================================================

-- ---- Subscription fields on profiles ----
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

-- Backfill plan for existing rows
UPDATE public.profiles SET plan = 'free' WHERE plan IS NULL;

-- Webhook lookups happen by Stripe customer id
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON public.profiles(stripe_customer_id);

-- ============================================================
-- USAGE EVENTS (token metering + audit trail for gated actions)
-- ============================================================
-- `kind` = 'tokens' → `amount` is a token count for a single AI call.
--          'practice_test' | 'note' → `amount` is 1 (audit trail; weekly
--          counts are derived from practice_sessions / notes tables).
CREATE TABLE IF NOT EXISTS public.usage_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('tokens', 'practice_test', 'note')),
  amount      INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- Owners can read their own usage. Writes are performed by the service-role
-- client only (bypasses RLS), so no INSERT policy is exposed to end users.
CREATE POLICY "Users can view own usage_events" ON public.usage_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_kind_created
  ON public.usage_events(user_id, kind, created_at);
