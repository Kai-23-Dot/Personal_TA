/**
 * POST /api/lms/canvas/token
 *
 * Stores a Canvas Personal Access Token (PAT) directly — no OAuth redirect required.
 * Useful for schools whose IT departments block OAuth flows.
 *
 * Body: { domain: string, access_token: string }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const domain: string = (body.domain ?? "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const accessToken: string = (body.access_token ?? "").trim();

  if (!domain || !accessToken) {
    return NextResponse.json({ error: "domain and access_token are required" }, { status: 400 });
  }
  if (!domain.includes(".")) {
    return NextResponse.json({ error: "Invalid domain — should look like school.instructure.com" }, { status: 400 });
  }

  // Validate the token by calling Canvas API before storing it
  let canvasProfile: { id: number; primary_email?: string; login_id?: string };
  try {
    const res = await fetch(`https://${domain}/api/v1/users/self/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 401) {
      return NextResponse.json({ error: "Invalid access token — check it and try again" }, { status: 400 });
    }
    if (res.status === 403) {
      return NextResponse.json({ error: "Token lacks required permissions" }, { status: 400 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: `Canvas returned ${res.status} — is the domain correct?` }, { status: 400 });
    }

    canvasProfile = await res.json();
  } catch {
    return NextResponse.json(
      { error: `Could not reach ${domain} — verify the domain is correct` },
      { status: 400 }
    );
  }

  // Upsert the connection (replaces any existing Canvas OAuth connection)
  const { error } = await supabase.from("lms_connections").upsert(
    {
      user_id: user.id,
      platform: "canvas",
      access_token: accessToken,
      refresh_token: null,
      token_expires_at: null,
      canvas_domain: domain,
      platform_user_id: String(canvasProfile.id),
      platform_email: canvasProfile.primary_email ?? canvasProfile.login_id ?? null,
      is_active: true,
      scopes: ["personal_access_token"],
    },
    { onConflict: "user_id,platform" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch the connection row so we can return its ID for auto-sync
  const { data: conn } = await supabase
    .from("lms_connections")
    .select("id")
    .eq("user_id", user.id)
    .eq("platform", "canvas")
    .single();

  return NextResponse.json({ success: true, connectionId: conn?.id ?? null });
}
