import { createClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import {
  stripe,
  TERMINAL_SUBSCRIPTION_STATUSES,
  appUrl,
  getConfiguredPlanPrices,
  getPortalConfigurationId,
  getOrCreateCustomer,
  getPriceIdForPlan,
  stripeIdempotencyKey,
} from "@/backend/billing/stripe";
import { isPaidPlan } from "@/backend/billing/plans";

/**
 * Create a Stripe hosted Checkout Session for a paid subscription and return
 * its URL. The client redirects the browser to it.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const selectedPlan = isPaidPlan(body?.plan) ? body.plan : "pro";
    let priceId: string;
    try {
      priceId = getPriceIdForPlan(selectedPlan);
    } catch {
      return NextResponse.json(
        { error: `Billing is not configured for the ${selectedPlan} plan.` },
        { status: 500 }
      );
    }

    const customerId = await getOrCreateCustomer(user.id, user.email ?? null);
    const base = appUrl();

    // Do not create a second recoverable Smartlearn subscription. Existing paid
    // customers change tiers through the Billing Portal.
    const configuredPriceIds = new Set(Object.values(getConfiguredPlanPrices()));
    const existing = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    const hasRecoverableSubscription = existing.data.some(
      (subscription) =>
        !TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status) &&
        subscription.items.data.some((item) => configuredPriceIds.has(item.price.id))
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
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { supabase_user_id: user.id, plan: selectedPlan },
        subscription_data: {
          metadata: { supabase_user_id: user.id, plan: selectedPlan },
        },
        success_url: `${base}/settings?checkout=success`,
        cancel_url: `${base}/pricing?checkout=cancelled`,
      },
      {
        idempotencyKey: stripeIdempotencyKey(
          "checkout",
          user.id,
          priceId
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
