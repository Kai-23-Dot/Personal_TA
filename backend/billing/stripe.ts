/**
 * Server-side Stripe client. Never import this into client components —
 * it relies on STRIPE_SECRET_KEY which must stay server-only.
 */
import Stripe from "stripe";

let _stripe: Stripe | null = null;

/** Subscription states that are entitled to Pro features. */
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

/** The recurring price id for the Pro plan ($20/mo). */
export const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID ?? "";

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
  plan: "free" | "pro";
  subscriptionId: string | null;
  status: Stripe.Subscription.Status | null;
  currentPeriodEnd: number | null;
}

/**
 * Resolve access from all subscriptions for the configured price. This avoids
 * downgrading a customer when an older duplicate subscription is canceled.
 */
export function resolveSubscriptionEntitlement(
  subscriptions: Stripe.Subscription[],
  priceId: string
): SubscriptionEntitlement {
  const matching = subscriptions.filter((subscription) =>
    subscriptionHasPrice(subscription, priceId)
  );
  const ranked = [...matching].sort((a, b) => {
    const aActive = ACTIVE_SUBSCRIPTION_STATUSES.has(a.status) ? 1 : 0;
    const bActive = ACTIVE_SUBSCRIPTION_STATUSES.has(b.status) ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    const periodDifference =
      (subscriptionPeriodEnd(b, priceId) ?? 0) -
      (subscriptionPeriodEnd(a, priceId) ?? 0);
    return periodDifference || b.created - a.created;
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
    plan: ACTIVE_SUBSCRIPTION_STATUSES.has(selected.status) ? "pro" : "free",
    subscriptionId: selected.id,
    status: selected.status,
    currentPeriodEnd: subscriptionPeriodEnd(selected, priceId),
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
