import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  stripe,
  getConfiguredPlanPrices,
  resolveSubscriptionEntitlement,
} from "@/backend/billing/stripe";
import { sendPlanChangeNotification } from "@/backend/email/planChange";
import { createServiceClient } from "@/backend/supabase/server";

// Stripe posts here unauthenticated; this route is exempt from auth in middleware.ts.
export const dynamic = "force-dynamic";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

const SUBSCRIPTION_EVENT_TYPES = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

function stripeObjectId(
  value: string | { id: string } | null | undefined
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function eventCustomerId(event: Stripe.Event): string | null {
  if (event.type === "checkout.session.completed") {
    return stripeObjectId((event.data.object as Stripe.Checkout.Session).customer);
  }
  if (SUBSCRIPTION_EVENT_TYPES.has(event.type)) {
    return stripeObjectId(
      (event.data.object as Stripe.Subscription).customer
    );
  }
  return null;
}

async function eventWasProcessed(eventId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("stripe_webhook_events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function recordIgnoredEvent(event: Stripe.Event): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("stripe_webhook_events").upsert(
    {
      event_id: event.id,
      event_type: event.type,
      event_created_at: new Date(event.created * 1000).toISOString(),
      processing_result: "ignored",
    },
    { onConflict: "event_id", ignoreDuplicates: true }
  );
  if (error) throw error;
}

/** Reconcile the customer's current Smartlearn entitlement, independent of event order. */
async function reconcileCustomer(customerId: string, event: Stripe.Event) {
  const configuredPrices = getConfiguredPlanPrices();
  if (Object.keys(configuredPrices).length === 0) {
    throw new Error("[billing] No paid Stripe prices are configured");
  }

  const supabase = createServiceClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) {
    // The Stripe account can contain customers unrelated to this application.
    await recordIgnoredEvent(event);
    return "ignored";
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  if (subscriptions.has_more) {
    console.warn(
      `[billing/webhook] More than 100 subscriptions found for customer ${customerId}; using the newest page.`
    );
  }
  const entitlement = resolveSubscriptionEntitlement(
    subscriptions.data,
    configuredPrices
  );

  const { data: result, error } = await supabase.rpc(
    "sync_stripe_subscription",
    {
      p_event_id: event.id,
      p_event_type: event.type,
      p_event_created_at: new Date(event.created * 1000).toISOString(),
      p_customer_id: customerId,
      p_subscription_id: entitlement.subscriptionId,
      p_subscription_status: entitlement.status,
      p_plan: entitlement.plan,
      p_current_period_end: entitlement.currentPeriodEnd
        ? new Date(entitlement.currentPeriodEnd * 1000).toISOString()
        : null,
    }
  );
  if (error) throw error;
  return result;
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
    const handled =
      event.type === "checkout.session.completed" ||
      SUBSCRIPTION_EVENT_TYPES.has(event.type);
    if (!handled) return NextResponse.json({ received: true });

    if (await eventWasProcessed(event.id)) {
      const email = await sendPlanChangeNotification(event.id);
      return NextResponse.json({ received: true, duplicate: true, email });
    }

    const customerId = eventCustomerId(event);
    if (!customerId) {
      await recordIgnoredEvent(event);
      return NextResponse.json({ received: true, ignored: true });
    }

    const result = await reconcileCustomer(customerId, event);
    const email = await sendPlanChangeNotification(event.id);
    return NextResponse.json({ received: true, result, email });
  } catch (err) {
    console.error(`[billing/webhook] handler error for ${event.type}:`, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
