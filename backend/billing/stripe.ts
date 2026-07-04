/**
 * Server-side Stripe client. Never import this into client components —
 * it relies on STRIPE_SECRET_KEY which must stay server-only.
 */
import Stripe from "stripe";

let _stripe: Stripe | null = null;

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
    appInfo: { name: "Conlearn" },
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
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Return the user's Stripe customer id, creating (and persisting) one if needed.
 * Uses the service-role client so it works regardless of RLS.
 */
export async function getOrCreateCustomer(userId: string, email: string | null): Promise<string> {
  const { createServiceClient } = await import("@/backend/supabase/server");
  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  if (profile?.stripe_customer_id) return profile.stripe_customer_id;

  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { supabase_user_id: userId },
  });

  await supabase.from("profiles").update({ stripe_customer_id: customer.id }).eq("id", userId);
  return customer.id;
}
