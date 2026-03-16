/**
 * Google Classroom OAuth routes
 *
 * GET /api/lms/google/auth   → Redirect to Google OAuth consent screen
 * GET /api/lms/google/callback → Handle OAuth callback, store tokens
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
  "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // ---- OAuth Callback ----
  if (code) {
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
    });

    if (!tokenRes.ok) {
      console.error("Google token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(new URL("/settings?error=google_auth_failed", req.url));
    }

    const tokens = await tokenRes.json();

    // Fetch user info
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
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
    }

    const syncParam = conn?.id ? `&sync_id=${conn.id}` : "";
    return NextResponse.redirect(new URL(`/settings?connected=google_classroom${syncParam}`, req.url));
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

  return NextResponse.redirect(authUrl.toString());
}
