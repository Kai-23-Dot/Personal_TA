import { createClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import { stripe, PRO_PRICE_ID, appUrl, getOrCreateCustomer } from "@/backend/billing/stripe";

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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: PRO_PRICE_ID, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${base}/settings?checkout=success`,
      cancel_url: `${base}/pricing?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/checkout] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Checkout failed" }, { status: 500 });
  }
}
