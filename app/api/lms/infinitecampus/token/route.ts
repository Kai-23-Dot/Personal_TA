/**
 * POST /api/lms/infinitecampus/token
 *
 * Stores an Infinite Campus Personal Access Token directly.
 * Use this when the district hasn't configured OAuth (most common for students).
 *
 * To generate a token in IC: log into your Student Portal →
 * Account Settings → Security → Generate Access Token
 *
 * Body: { domain: string, access_token: string }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { fetchICProfile } from "@/backend/lms/infinite-campus";

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
    return NextResponse.json(
      { error: "Invalid domain — should look like district.infinitecampus.org" },
      { status: 400 }
    );
  }

  // Validate the token by fetching the student profile
  const profile = await fetchICProfile(domain, accessToken);
  if (!profile) {
    return NextResponse.json(
      { error: "Could not authenticate — check your domain and token" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("lms_connections").upsert(
    {
      user_id: user.id,
      platform: "infinite_campus",
      access_token: accessToken,
      refresh_token: null,
      token_expires_at: null,
      canvas_domain: domain, // reuse canvas_domain column for IC domain
      platform_user_id: String(profile.personID),
      platform_email: profile.email ?? null,
      scopes: ["personal_access_token"],
      is_active: true,
    },
    { onConflict: "user_id,platform" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: conn } = await supabase
    .from("lms_connections")
    .select("id")
    .eq("user_id", user.id)
    .eq("platform", "infinite_campus")
    .single();

  return NextResponse.json({ success: true, connectionId: conn?.id ?? null });
}
