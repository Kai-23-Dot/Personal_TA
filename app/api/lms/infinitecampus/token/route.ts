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
import { normalizeInfiniteCampusDomain } from "@/backend/security/infiniteCampus";
import { z } from "zod";

const infiniteCampusTokenSchema = z.object({
  access_token: z.string().trim().min(1).max(4096),
  domain: z.string().trim().min(1).max(300),
}).strict();

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = infiniteCampusTokenSchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid domain and token are required." }, { status: 400 });
  }
  let domain: string;
  try {
    domain = normalizeInfiniteCampusDomain(parsed.data.domain);
  } catch {
    return NextResponse.json({ error: "Infinite Campus domain is not allowed." }, { status: 400 });
  }
  const accessToken = parsed.data.access_token;

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

  if (error) {
    console.error("[Infinite Campus] Connection save failed:", error);
    return NextResponse.json({ error: "Failed to save Infinite Campus connection." }, { status: 500 });
  }

  const { data: conn } = await supabase
    .from("lms_connections")
    .select("id")
    .eq("user_id", user.id)
    .eq("platform", "infinite_campus")
    .single();

  return NextResponse.json({ success: true, connectionId: conn?.id ?? null });
}
