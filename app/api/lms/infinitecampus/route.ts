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

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { fetchICProfile } from "@/backend/lms/infinite-campus";
import {
  createInfiniteCampusState,
  normalizeInfiniteCampusDomain,
  verifyInfiniteCampusState,
} from "@/backend/security/infiniteCampus";

const IC_STATE_COOKIE = "conlearn_ic_oauth_nonce";
function icBase(domain: string) {
  return `https://${normalizeInfiniteCampusDomain(domain)}/campus`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // ── OAuth Callback ──────────────────────────────────────────────────────
  if (code && state) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/login", req.url));

    let icDomain: string;
    try {
      icDomain = verifyInfiniteCampusState(
        state,
        req.cookies.get(IC_STATE_COOKIE)?.value
      ).domain;
    } catch (stateError) {
      console.warn("[Infinite Campus OAuth] State verification failed:", stateError);
      const response = NextResponse.redirect(
        new URL("/settings?error=ic_oauth_state_invalid", req.url)
      );
      response.cookies.delete(IC_STATE_COOKIE);
      return response;
    }
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
      signal: AbortSignal.timeout(15_000),
    });

    if (!tokenRes.ok) {
      console.error("IC token exchange failed with status:", tokenRes.status);
      return NextResponse.redirect(new URL("/settings?error=ic_auth_failed", req.url));
    }

    const tokens = await tokenRes.json() as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };
    if (!tokens.access_token) {
      return NextResponse.redirect(new URL("/settings?error=ic_auth_failed", req.url));
    }
    const profile = await fetchICProfile(icDomain, tokens.access_token);

    const { data: conn, error: dbError } = await supabase
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
    if (dbError) {
      console.error("DB error saving Infinite Campus connection:", dbError);
      return NextResponse.redirect(new URL("/settings?error=ic_save_failed", req.url));
    }

    const syncParam = conn?.id ? `&sync_id=${conn.id}` : "";
    const response = NextResponse.redirect(
      new URL(`/settings?connected=infinite_campus${syncParam}`, req.url)
    );
    response.cookies.delete(IC_STATE_COOKIE);
    return response;
  }

  if (error) {
    return NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent(error)}`, req.url));
  }

  // ── Initiate OAuth ──────────────────────────────────────────────────────
  if (!process.env.INFINITE_CAMPUS_CLIENT_ID || !process.env.INFINITE_CAMPUS_CLIENT_SECRET) {
    return NextResponse.redirect(new URL("/settings?error=ic_not_configured", req.url));
  }

  let domain: string;
  try {
    domain = normalizeInfiniteCampusDomain(searchParams.get("domain") ?? "");
  } catch {
    return NextResponse.redirect(new URL("/settings?error=ic_domain_invalid", req.url));
  }

  const { state: oauthState, cookieNonce } =
    createInfiniteCampusState(domain);
  const base = icBase(domain);
  const authUrl = new URL(`${base}/oAuth/authorize`);
  authUrl.searchParams.set("client_id", process.env.INFINITE_CAMPUS_CLIENT_ID);
  authUrl.searchParams.set(
    "redirect_uri",
    `${process.env.NEXT_PUBLIC_APP_URL}/api/lms/infinitecampus`
  );
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", oauthState);

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set(IC_STATE_COOKIE, cookieNonce, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/api/lms/infinitecampus",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
