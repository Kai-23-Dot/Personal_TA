/**
 * Microsoft Graph Education OAuth routes
 *
 * GET /api/lms/microsoft       → Initiate OAuth (redirect to Microsoft)
 * GET /api/lms/microsoft?code= → Handle callback
 *
 * Register at: https://portal.azure.com > App registrations
 * Grant API permissions: EduAssignments.ReadBasic, EduRoster.ReadBasic, Calendars.Read
 */

import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";

const MS_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "EduAssignments.ReadBasic",
  "EduRoster.ReadBasic",
  "Calendars.Read",
].join(" ");

const TENANT = process.env.MICROSOFT_TENANT_ID ?? "common";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // ---- Callback ----
  if (code) {
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
      }
    );

    if (!tokenRes.ok) {
      console.error("MS token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(new URL("/settings?error=microsoft_auth_failed", req.url));
    }

    const tokens = await tokenRes.json();

    // Get user profile
    const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = profileRes.ok ? await profileRes.json() : {};

    const { data: conn } = await supabase.from("lms_connections").upsert(
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

    const syncParam = conn?.id ? `&sync_id=${conn.id}` : "";
    return NextResponse.redirect(new URL(`/settings?connected=microsoft_teams${syncParam}`, req.url));
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

  return NextResponse.redirect(authUrl.toString());
}
