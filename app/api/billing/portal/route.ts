import { createClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import { stripe, appUrl, getOrCreateCustomer } from "@/backend/billing/stripe";

/**
 * Create a Stripe Billing Portal session so the user can manage or cancel
 * their subscription. Returns the portal URL for a client redirect.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const customerId = await getOrCreateCustomer(user.id, user.email ?? null);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl()}/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/portal] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Portal failed" }, { status: 500 });
  }
}
