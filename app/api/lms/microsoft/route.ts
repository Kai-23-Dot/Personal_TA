/**
 * Microsoft Graph Education OAuth routes
 *
 * GET /api/lms/microsoft       → Initiate OAuth (redirect to Microsoft)
 * GET /api/lms/microsoft?code= → Handle callback
 *
 * Register at: https://portal.azure.com > App registrations
 * Grant API permissions: EduAssignments.ReadBasic, EduRoster.ReadBasic, Calendars.Read
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { createOAuthNonce, verifyOAuthNonce } from "@/backend/security/oauthState";

const MICROSOFT_STATE_COOKIE = "smartlearn_microsoft_oauth_state";

const MS_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "EduAssignments.ReadBasic",
  "EduRoster.ReadBasic",
  "Calendars.Read",
].join(" ");

const rawTenant = process.env.MICROSOFT_TENANT_ID ?? "common";
const TENANT = /^(?:common|organizations|consumers|[0-9a-f-]{36})$/i.test(rawTenant)
  ? rawTenant
  : "common";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // ---- Callback ----
  if (code) {
    if (!verifyOAuthNonce(state, req.cookies.get(MICROSOFT_STATE_COOKIE)?.value)) {
      const response = NextResponse.redirect(
        new URL("/settings?error=microsoft_oauth_state_invalid", req.url)
      );
      response.cookies.delete(MICROSOFT_STATE_COOKIE);
      return response;
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/login", req.url));

    // Token exchange
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: process.env.MICROSOFT_CLIENT_ID!,
          client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
          redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/lms/microsoft`,
          scope: MS_SCOPES,
        }),
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (!tokenRes.ok) {
      console.error("MS token exchange failed with status:", tokenRes.status);
      return NextResponse.redirect(new URL("/settings?error=microsoft_auth_failed", req.url));
    }

    const tokens = await tokenRes.json() as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };
    if (!tokens.access_token) {
      return NextResponse.redirect(new URL("/settings?error=microsoft_auth_failed", req.url));
    }

    // Get user profile
    const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const profile = profileRes.ok ? await profileRes.json() : {};

    const { data: conn, error: dbError } = await supabase.from("lms_connections").upsert(
      {
        user_id: user.id,
        platform: "microsoft_teams",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        token_expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        platform_user_id: profile.id ?? null,
        platform_email: profile.mail ?? profile.userPrincipalName ?? null,
        scopes: MS_SCOPES.split(" "),
        is_active: true,
      },
      { onConflict: "user_id,platform" }
    ).select("id").single();
    if (dbError) {
      console.error("DB error saving Microsoft connection:", dbError);
      return NextResponse.redirect(new URL("/settings?error=microsoft_save_failed", req.url));
    }

    const syncParam = conn?.id ? `&sync_id=${conn.id}` : "";
    const response = NextResponse.redirect(new URL(`/settings?connected=microsoft_teams${syncParam}`, req.url));
    response.cookies.delete(MICROSOFT_STATE_COOKIE);
    return response;
  }

  if (error) {
    return NextResponse.redirect(new URL(`/settings?error=${error}`, req.url));
  }

  // Guard: credentials must be configured
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    return NextResponse.redirect(new URL("/settings?error=microsoft_not_configured", req.url));
  }

  // ---- Initiate OAuth ----
  const authUrl = new URL(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`
  );
  authUrl.searchParams.set("client_id", process.env.MICROSOFT_CLIENT_ID!);
  authUrl.searchParams.set(
    "redirect_uri",
    `${process.env.NEXT_PUBLIC_APP_URL}/api/lms/microsoft`
  );
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", MS_SCOPES);
  authUrl.searchParams.set("response_mode", "query");
  const oauthState = createOAuthNonce();
  authUrl.searchParams.set("state", oauthState);

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set(MICROSOFT_STATE_COOKIE, oauthState, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/api/lms/microsoft",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
