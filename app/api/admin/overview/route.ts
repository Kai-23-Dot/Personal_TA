import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { isAdminIdentity } from "@/backend/admin/access";
import { getAdminOverview, parseAdminPeriod } from "@/backend/admin/overview";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminIdentity({ id: user.id, email: user.email })) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const days = parseAdminPeriod(request.nextUrl.searchParams.get("days"));
    const overview = await getAdminOverview(days);
    return NextResponse.json(overview, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    console.error("[admin] Overview request failed:", error);
    return NextResponse.json(
      { error: "Admin analytics could not be loaded right now." },
      { status: 500, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }
}
