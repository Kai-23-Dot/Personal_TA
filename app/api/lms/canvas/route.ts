/**
 * Canvas LMS OAuth routes
 *
 * GET /api/lms/canvas?domain=school.instructure.com  → Redirect to Canvas OAuth
 * GET /api/lms/canvas (with code+state)              → Handle OAuth callback
 *
 * Canvas OAuth is per-institution. The student provides their school's Canvas domain.
 * Credentials (CANVAS_CLIENT_ID, CANVAS_CLIENT_SECRET) must be issued by the school's IT admin.
 *
 * Multiple Canvas accounts are supported — one connection per (user, canvas_domain).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { fetchCanvasUserProfile } from "@/backend/lms/canvas";

/** Upsert a Canvas connection keyed by (user_id, canvas_domain). */
async function upsertCanvasConnection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  fields: {
    canvas_domain: string;
    access_token: string;
    refresh_token?: string | null;
    platform_user_id?: string | null;
    platform_email?: string | null;
    scopes?: string[];
  }
): Promise<string | null> {
  const { canvas_domain, access_token, refresh_token, platform_user_id, platform_email, scopes } = fields;

  // Check for an existing connection with this domain
  const { data: existing } = await supabase
    .from("lms_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("platform", "canvas")
    .eq("canvas_domain", canvas_domain)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("lms_connections")
      .update({
        access_token,
        refresh_token: refresh_token ?? null,
        platform_user_id: platform_user_id ?? null,
        platform_email: platform_email ?? null,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: newConn } = await supabase
    .from("lms_connections")
    .insert({
      user_id: userId,
      platform: "canvas",
      canvas_domain,
      access_token,
      refresh_token: refresh_token ?? null,
      platform_user_id: platform_user_id ?? null,
      platform_email: platform_email ?? null,
      scopes: scopes ?? null,
      is_active: true,
    })
    .select("id")
    .single();

  return newConn?.id ?? null;
}

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

    const connId = await upsertCanvasConnection(supabase, user.id, {
      canvas_domain: canvasDomain,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      platform_user_id: profile.id ? String(profile.id) : null,
      platform_email: profile.login_id ?? profile.primary_email ?? null,
    });

    // Pass the connection ID so the settings page can auto-trigger sync
    const syncParam = connId ? `&sync_id=${connId}` : "";
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

    const connId = await upsertCanvasConnection(supabase, user.id, {
      canvas_domain: domain,
      access_token: accessToken,
      refresh_token: null,
      platform_user_id: profile.id ? String(profile.id) : null,
      platform_email: profile.login_id ?? profile.primary_email ?? null,
      scopes: ["personal_access_token"],
    });

    return NextResponse.json({ success: true, connectionId: connId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to connect Canvas" }, { status: 500 });
  }
}
