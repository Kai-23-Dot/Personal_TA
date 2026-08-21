/**
 * Google Classroom OAuth routes
 *
 * GET /api/lms/google/auth   → Redirect to Google OAuth consent screen
 * GET /api/lms/google/callback → Handle OAuth callback, store tokens
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { createOAuthNonce, verifyOAuthNonce } from "@/backend/security/oauthState";

const GOOGLE_STATE_COOKIE = "smartlearn_google_oauth_state";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
  "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // ---- OAuth Callback ----
  if (code) {
    if (!verifyOAuthNonce(state, req.cookies.get(GOOGLE_STATE_COOKIE)?.value)) {
      const response = NextResponse.redirect(
        new URL("/settings?error=google_oauth_state_invalid", req.url)
      );
      response.cookies.delete(GOOGLE_STATE_COOKIE);
      return response;
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/login", req.url));

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/lms/google`,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!tokenRes.ok) {
      console.error("Google token exchange failed with status:", tokenRes.status);
      return NextResponse.redirect(new URL("/settings?error=google_auth_failed", req.url));
    }

    const tokens = await tokenRes.json() as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };
    if (!tokens.access_token) {
      return NextResponse.redirect(new URL("/settings?error=google_auth_failed", req.url));
    }

    // Fetch user info
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const userInfo = userInfoRes.ok ? await userInfoRes.json() : {};

    // Upsert LMS connection
    const { data: conn, error: dbError } = await supabase.from("lms_connections").upsert(
      {
        user_id: user.id,
        platform: "google_classroom",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        token_expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        platform_email: userInfo.email ?? null,
        platform_user_id: userInfo.id ?? null,
        scopes: GOOGLE_SCOPES.split(" "),
        is_active: true,
      },
      { onConflict: "user_id,platform" }
    ).select("id").single();

    if (dbError) {
      console.error("DB error saving Google connection:", dbError);
      return NextResponse.redirect(new URL("/settings?error=google_save_failed", req.url));
    }

    const syncParam = conn?.id ? `&sync_id=${conn.id}` : "";
    const response = NextResponse.redirect(new URL(`/settings?connected=google_classroom${syncParam}`, req.url));
    response.cookies.delete(GOOGLE_STATE_COOKIE);
    return response;
  }

  // ---- Auth redirect (initiate flow) ----
  if (error) {
    return NextResponse.redirect(new URL(`/settings?error=${error}`, req.url));
  }

  // Guard: credentials must be configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(new URL("/settings?error=google_not_configured", req.url));
  }

  // Start OAuth flow
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  authUrl.searchParams.set("redirect_uri", `${process.env.NEXT_PUBLIC_APP_URL}/api/lms/google`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  const oauthState = createOAuthNonce();
  authUrl.searchParams.set("state", oauthState);

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set(GOOGLE_STATE_COOKIE, oauthState, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/api/lms/google",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
