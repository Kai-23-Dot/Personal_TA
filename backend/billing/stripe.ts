/**
 * Server-side Stripe client. Never import this into client components —
 * it relies on STRIPE_SECRET_KEY which must stay server-only.
 */
import Stripe from "stripe";
import {
  PAID_PLAN_IDS,
  PLAN_RANK,
  type PaidPlan,
  type Plan,
} from "@/backend/billing/plans";

let _stripe: Stripe | null = null;

/** Subscription states that grant access to a paid Smartlearn plan. */
export const ACTIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
]);

/** Terminal states that are safe to replace with a new Checkout subscription. */
export const TERMINAL_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "canceled",
  "incomplete_expired",
]);

/**
 * Lazily construct the Stripe client. Instantiating at module load breaks the
 * production build: Next.js collects page data with no env vars, and the Stripe
 * SDK throws ("Neither apiKey nor config.authenticator provided") on an empty
 * key. Deferring construction to first use keeps the key requirement at request
 * time, where it belongs.
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("[billing] STRIPE_SECRET_KEY is not set");
  }
  _stripe = new Stripe(secretKey, {
    // Pin nothing here so the SDK uses the account's default API version,
    // avoiding TS literal-version drift across stripe-node upgrades.
    appInfo: { name: "Smartlearn" },
    typescript: true,
  });
  return _stripe;
}

/**
 * Proxy that forwards to the lazily-constructed client, so existing
 * `stripe.checkout.sessions.create(...)` call sites keep working while the real
 * client is only built when a property is first accessed (i.e. at request time).
 */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripe() as object, prop, receiver);
  },
});

const PRICE_ENV_BY_PLAN: Record<PaidPlan, string> = {
  plus: "STRIPE_PLUS_PRICE_ID",
  pro: "STRIPE_PRO_PRICE_ID",
  max: "STRIPE_MAX_PRICE_ID",
};

export type ConfiguredPlanPrices = Partial<Record<PaidPlan, string>>;

/** Read configured recurring Stripe prices at request time. */
export function getConfiguredPlanPrices(): ConfiguredPlanPrices {
  const prices: ConfiguredPlanPrices = {};
  const seen = new Set<string>();
  for (const plan of PAID_PLAN_IDS) {
    const priceId = process.env[PRICE_ENV_BY_PLAN[plan]]?.trim();
    if (!priceId) continue;
    if (seen.has(priceId)) {
      throw new Error(`[billing] Stripe price ids must be unique (${priceId})`);
    }
    prices[plan] = priceId;
    seen.add(priceId);
  }
  return prices;
}

export function getPriceIdForPlan(plan: PaidPlan): string {
  const priceId = getConfiguredPlanPrices()[plan];
  if (!priceId) {
    throw new Error(`[billing] ${PRICE_ENV_BY_PLAN[plan]} is not set`);
  }
  return priceId;
}

/** Absolute base URL for Checkout / Portal redirect targets. */
export function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL(configured);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("[billing] NEXT_PUBLIC_APP_URL must use HTTP or HTTPS");
  }
  return url.origin;
}

/** Stable keys make retried customer/session POSTs safe from duplicate objects. */
export function stripeIdempotencyKey(
  operation: "customer" | "checkout",
  userId: string,
  priceId?: string
): string {
  return ["smartlearn", operation, userId, priceId].filter(Boolean).join(":");
}

/** Optional override; omit it to let Stripe use the mode's default portal. */
export function getPortalConfigurationId(): string | undefined {
  return process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim() || undefined;
}

export function subscriptionHasPrice(
  subscription: Stripe.Subscription,
  priceId: string
): boolean {
  return subscription.items.data.some((item) => item.price.id === priceId);
}

/** Stripe's current API keeps billing-period dates on subscription items. */
export function subscriptionPeriodEnd(
  subscription: Stripe.Subscription,
  priceId: string
): number | null {
  const ends = subscription.items.data
    .filter((item) => item.price.id === priceId)
    .map((item) => item.current_period_end)
    .filter((value): value is number => Number.isFinite(value));
  return ends.length > 0 ? Math.max(...ends) : null;
}

export interface SubscriptionEntitlement {
  plan: Plan;
  subscriptionId: string | null;
  status: Stripe.Subscription.Status | null;
  currentPeriodEnd: number | null;
}

/**
 * Resolve access from all subscriptions for the configured Smartlearn prices.
 * If duplicate paid subscriptions exist, an active higher tier wins.
 */
export function resolveSubscriptionEntitlement(
  subscriptions: Stripe.Subscription[],
  prices: ConfiguredPlanPrices
): SubscriptionEntitlement {
  const planForSubscription = (subscription: Stripe.Subscription): PaidPlan | null => {
    const matchingPlans = PAID_PLAN_IDS.filter((plan) => {
      const priceId = prices[plan];
      return Boolean(priceId && subscriptionHasPrice(subscription, priceId));
    });
    return matchingPlans.sort((a, b) => PLAN_RANK[b] - PLAN_RANK[a])[0] ?? null;
  };
  const matching = subscriptions
    .map((subscription) => ({ subscription, plan: planForSubscription(subscription) }))
    .filter(
      (entry): entry is { subscription: Stripe.Subscription; plan: PaidPlan } =>
        entry.plan !== null
    );
  const ranked = [...matching].sort((a, b) => {
    const aActive = ACTIVE_SUBSCRIPTION_STATUSES.has(a.subscription.status) ? 1 : 0;
    const bActive = ACTIVE_SUBSCRIPTION_STATUSES.has(b.subscription.status) ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    const planDifference = PLAN_RANK[b.plan] - PLAN_RANK[a.plan];
    if (planDifference) return planDifference;
    const aPriceId = prices[a.plan] as string;
    const bPriceId = prices[b.plan] as string;
    const periodDifference =
      (subscriptionPeriodEnd(b.subscription, bPriceId) ?? 0) -
      (subscriptionPeriodEnd(a.subscription, aPriceId) ?? 0);
    return periodDifference || b.subscription.created - a.subscription.created;
  });
  const selected = ranked[0];
  if (!selected) {
    return {
      plan: "free",
      subscriptionId: null,
      status: null,
      currentPeriodEnd: null,
    };
  }

  return {
    plan: ACTIVE_SUBSCRIPTION_STATUSES.has(selected.subscription.status)
      ? selected.plan
      : "free",
    subscriptionId: selected.subscription.id,
    status: selected.subscription.status,
    currentPeriodEnd: subscriptionPeriodEnd(
      selected.subscription,
      prices[selected.plan] as string
    ),
  };
}

/**
 * Return the user's Stripe customer id, creating (and persisting) one if needed.
 * Uses the service-role client so it works regardless of RLS.
 */
export async function getOrCreateCustomer(userId: string, email: string | null): Promise<string> {
  const { createServiceClient } = await import("@/backend/supabase/server");
  const supabase = createServiceClient();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();
  if (profileError) {
    throw new Error("[billing] Could not load the billing profile", {
      cause: profileError,
    });
  }

  if (profile?.stripe_customer_id) return profile.stripe_customer_id;

  const customer = await stripe.customers.create(
    {
      email: email ?? undefined,
      metadata: { supabase_user_id: userId },
    },
    { idempotencyKey: stripeIdempotencyKey("customer", userId) }
  );

  // Only the first concurrent request claims the empty profile field.
  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId)
    .is("stripe_customer_id", null)
    .select("stripe_customer_id")
    .maybeSingle();
  if (updateError) {
    throw new Error("[billing] Could not save the Stripe customer", {
      cause: updateError,
    });
  }
  if (updated?.stripe_customer_id) return updated.stripe_customer_id;

  // A concurrent request may have won the claim. Always use the persisted id.
  const { data: concurrentProfile, error: concurrentError } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();
  if (concurrentError || !concurrentProfile?.stripe_customer_id) {
    throw new Error("[billing] Stripe customer was not persisted", {
      cause: concurrentError ?? undefined,
    });
  }
  return concurrentProfile.stripe_customer_id;
}
