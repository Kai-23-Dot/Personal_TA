/**
 * Infinite Campus OAuth routes
 *
 * GET /api/lms/infinitecampus?domain=district.infinitecampus.org → Initiate OAuth
 * GET /api/lms/infinitecampus?code=&state= → Handle OAuth callback
 *
 * Each district hosts its own IC instance. The student provides their district domain.
 * Requires INFINITE_CAMPUS_CLIENT_ID and INFINITE_CAMPUS_CLIENT_SECRET from
 * the district's IT admin (or use the token endpoint if OAuth isn't available).
 *
 * IC OAuth endpoints (relative to https://{domain}/campus):
 *   Authorize: /oAuth/authorize
 *   Token:     /oAuth/token
 */

import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { fetchICProfile } from "@/backend/lms/infinite-campus";

function icBase(domain: string) {
  const d = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return d.endsWith("/campus") ? `https://${d}` : `https://${d}/campus`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // encoded domain
  const error = searchParams.get("error");

  // ── OAuth Callback ──────────────────────────────────────────────────────
  if (code && state) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/login", req.url));

    const icDomain = decodeURIComponent(state);
    const base = icBase(icDomain);

    const tokenRes = await fetch(`${base}/oAuth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: process.env.INFINITE_CAMPUS_CLIENT_ID!,
        client_secret: process.env.INFINITE_CAMPUS_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/lms/infinitecampus`,
      }),
    });

    if (!tokenRes.ok) {
      console.error("IC token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(new URL("/settings?error=ic_auth_failed", req.url));
    }

    const tokens = await tokenRes.json();
    const profile = await fetchICProfile(icDomain, tokens.access_token);

    const { data: conn } = await supabase
      .from("lms_connections")
      .upsert(
        {
          user_id: user.id,
          platform: "infinite_campus",
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? null,
          token_expires_at: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            : null,
          canvas_domain: icDomain, // reuse canvas_domain column for IC domain
          platform_user_id: profile ? String(profile.personID) : null,
          platform_email: profile?.email ?? null,
          scopes: ["oauth"],
          is_active: true,
        },
        { onConflict: "user_id,platform" }
      )
      .select("id")
      .single();

    const syncParam = conn?.id ? `&sync_id=${conn.id}` : "";
    return NextResponse.redirect(
      new URL(`/settings?connected=infinite_campus${syncParam}`, req.url)
    );
  }

  if (error) {
    return NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent(error)}`, req.url));
  }

  // ── Initiate OAuth ──────────────────────────────────────────────────────
  if (!process.env.INFINITE_CAMPUS_CLIENT_ID || !process.env.INFINITE_CAMPUS_CLIENT_SECRET) {
    return NextResponse.redirect(new URL("/settings?error=ic_not_configured", req.url));
  }

  const domain = searchParams.get("domain");
  if (!domain || !domain.includes(".")) {
    return NextResponse.redirect(new URL("/settings?error=ic_domain_required", req.url));
  }

  const base = icBase(domain);
  const authUrl = new URL(`${base}/oAuth/authorize`);
  authUrl.searchParams.set("client_id", process.env.INFINITE_CAMPUS_CLIENT_ID);
  authUrl.searchParams.set(
    "redirect_uri",
    `${process.env.NEXT_PUBLIC_APP_URL}/api/lms/infinitecampus`
  );
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", encodeURIComponent(domain));

  return NextResponse.redirect(authUrl.toString());
}
