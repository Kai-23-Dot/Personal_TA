import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/backend/billing/stripe";
import { createServiceClient } from "@/backend/supabase/server";

// Stripe posts here unauthenticated; this route is exempt from auth in middleware.ts.
export const dynamic = "force-dynamic";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

/** Statuses Stripe considers as granting access. */
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/** Write subscription state back onto the matching profile (keyed by customer id). */
async function syncSubscription(sub: Stripe.Subscription) {
  const supabase = createServiceClient();
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const isActive = ACTIVE_STATUSES.has(sub.status);
  // current_period_end is a unix timestamp (seconds).
  const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;

  const { error } = await supabase
    .from("profiles")
    .update({
      plan: isActive ? "pro" : "free",
      subscription_status: sub.status,
      stripe_subscription_id: sub.id,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    })
    .eq("stripe_customer_id", customerId);

  if (error) console.error("[billing/webhook] profile update failed:", error);
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[billing/webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const subId =
            typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscription(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        // Ignore unrelated events.
        break;
    }
  } catch (err) {
    console.error(`[billing/webhook] handler error for ${event.type}:`, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
