import { createClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import { getUsageSummary } from "@/backend/billing/limits";

/** Returns the current user's plan, plan limits, and this-period usage. */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const summary = await getUsageSummary(user.id);
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[billing/status] error:", err);
    return NextResponse.json({ error: "Failed to load billing status" }, { status: 500 });
  }
}
