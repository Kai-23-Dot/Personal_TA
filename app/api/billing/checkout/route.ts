import { createClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import {
  stripe,
  PRO_PRICE_ID,
  TERMINAL_SUBSCRIPTION_STATUSES,
  appUrl,
  getPortalConfigurationId,
  getOrCreateCustomer,
  stripeIdempotencyKey,
} from "@/backend/billing/stripe";

/**
 * Create a Stripe hosted Checkout Session for the Pro subscription and return
 * its URL. The client redirects the browser to it.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!PRO_PRICE_ID) {
      return NextResponse.json({ error: "Billing is not configured (missing STRIPE_PRO_PRICE_ID)." }, { status: 500 });
    }

    const customerId = await getOrCreateCustomer(user.id, user.email ?? null);
    const base = appUrl();

    // Do not create a second recoverable/active Pro subscription. A stale UI or
    // a retried click should take the customer to management instead.
    const existing = await stripe.subscriptions.list({
      customer: customerId,
      price: PRO_PRICE_ID,
      status: "all",
      limit: 100,
    });
    const hasRecoverableSubscription = existing.data.some(
      (subscription) => !TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status)
    );
    if (hasRecoverableSubscription) {
      const configuration = getPortalConfigurationId();
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        configuration,
        return_url: `${base}/settings`,
      });
      if (!portal.url) throw new Error("[billing] Stripe returned no portal URL");
      return NextResponse.json({ url: portal.url, destination: "portal" });
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        client_reference_id: user.id,
        line_items: [{ price: PRO_PRICE_ID, quantity: 1 }],
        allow_promotion_codes: true,
        metadata: { supabase_user_id: user.id, plan: "pro" },
        subscription_data: {
          metadata: { supabase_user_id: user.id, plan: "pro" },
        },
        success_url: `${base}/settings?checkout=success`,
        cancel_url: `${base}/pricing?checkout=cancelled`,
      },
      {
        idempotencyKey: stripeIdempotencyKey(
          "checkout",
          user.id,
          PRO_PRICE_ID
        ),
      }
    );

    if (!session.url) throw new Error("[billing] Stripe returned no Checkout URL");
    return NextResponse.json({ url: session.url, destination: "checkout" });
  } catch (err) {
    console.error("[billing/checkout] error:", err);
    return NextResponse.json({ error: "Checkout could not be started." }, { status: 500 });
  }
}
