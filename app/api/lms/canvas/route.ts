/**
 * Canvas LMS OAuth routes
 *
 * GET /api/lms/canvas?domain=school.instructure.com  → Redirect to Canvas OAuth
 * GET /api/lms/canvas (with code+state)              → Handle OAuth callback
 *
 * Canvas OAuth is per-institution. The student provides their school's Canvas domain.
 * Credentials (CANVAS_CLIENT_ID, CANVAS_CLIENT_SECRET) must be issued by the school's IT admin.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { fetchCanvasUserProfile } from "@/backend/lms/canvas";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // contains canvas domain
  const error = searchParams.get("error");

  // ---- OAuth Callback ----
  if (code && state) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/login", req.url));

    const canvasDomain = decodeURIComponent(state);

    // Exchange code for token
    const tokenRes = await fetch(`https://${canvasDomain}/login/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.CANVAS_CLIENT_ID!,
        client_secret: process.env.CANVAS_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/lms/canvas`,
        code,
      }),
    });

    if (!tokenRes.ok) {
      console.error("Canvas token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(new URL("/settings?error=canvas_auth_failed", req.url));
    }

    const tokens = await tokenRes.json();

    // Get Canvas user profile
    const profileRes = await fetch(`https://${canvasDomain}/api/v1/users/self/profile`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = profileRes.ok ? await profileRes.json() : {};

    const { data: conn, error: dbError } = await supabase.from("lms_connections").upsert(
      {
        user_id: user.id,
        platform: "canvas",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        canvas_domain: canvasDomain,
        platform_user_id: profile.id ? String(profile.id) : null,
        platform_email: profile.login_id ?? profile.primary_email ?? null,
        is_active: true,
      },
      { onConflict: "user_id,platform" }
    ).select("id").single();

    if (dbError) {
      console.error("DB error saving Canvas connection:", dbError);
    }

    // Pass the connection ID so the settings page can auto-trigger sync
    const syncParam = conn?.id ? `&sync_id=${conn.id}` : "";
    return NextResponse.redirect(new URL(`/settings?connected=canvas${syncParam}`, req.url));
  }

  if (error) {
    return NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent(error)}`, req.url));
  }

  // ---- Initiate OAuth ----
  if (!process.env.CANVAS_CLIENT_ID || !process.env.CANVAS_CLIENT_SECRET) {
    return NextResponse.redirect(new URL("/settings?error=canvas_not_configured", req.url));
  }

  const domain = searchParams.get("domain");
  if (!domain || !domain.includes(".")) {
    return NextResponse.redirect(
      new URL("/settings?error=canvas_domain_required", req.url)
    );
  }

  const authUrl = new URL(`https://${domain}/login/oauth2/auth`);
  authUrl.searchParams.set("client_id", process.env.CANVAS_CLIENT_ID);
  authUrl.searchParams.set(
    "redirect_uri",
    `${process.env.NEXT_PUBLIC_APP_URL}/api/lms/canvas`
  );
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", encodeURIComponent(domain));
  // Omitting "scope" requests all permissions granted to the developer key

  return NextResponse.redirect(authUrl.toString());
}

/**
 * Token-based Canvas connection
 * POST /api/lms/canvas
 * body: { domain: string, access_token: string }
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as { domain?: string; access_token?: string };
    const domain = (body.domain ?? "").trim().toLowerCase();
    const accessToken = (body.access_token ?? "").trim();

    if (!domain || !domain.includes(".")) {
      return NextResponse.json({ error: "Valid Canvas domain is required (e.g. school.instructure.com)." }, { status: 400 });
    }
    if (!accessToken) {
      return NextResponse.json({ error: "Canvas access token is required." }, { status: 400 });
    }

    // Validate token by fetching user profile from Canvas.
    const profile = await fetchCanvasUserProfile(domain, accessToken);
    if (!profile) {
      return NextResponse.json({ error: "Canvas token validation failed. Check domain/token and try again." }, { status: 400 });
    }

    const { data: conn, error: dbError } = await supabase.from("lms_connections").upsert(
      {
        user_id: user.id,
        platform: "canvas",
        access_token: accessToken,
        refresh_token: null,
        canvas_domain: domain,
        platform_user_id: profile.id ? String(profile.id) : null,
        platform_email: profile.login_id ?? profile.primary_email ?? null,
        scopes: ["personal_access_token"],
        is_active: true,
      },
      { onConflict: "user_id,platform" }
    ).select("id").single();

    if (dbError) {
      return NextResponse.json({ error: `Failed to save Canvas connection: ${dbError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, connectionId: conn?.id ?? null });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to connect Canvas" }, { status: 500 });
  }
}
