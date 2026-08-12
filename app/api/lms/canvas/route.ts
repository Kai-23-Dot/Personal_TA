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

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { fetchCanvasUserProfile } from "@/backend/lms/canvas";
import {
  createCanvasOAuthState,
  normalizeCanvasDomain,
  verifyCanvasOAuthState,
} from "@/backend/security/canvas";
import { z } from "zod";

const CANVAS_STATE_COOKIE = "conlearn_canvas_oauth_nonce";
const canvasTokenSchema = z.object({
  access_token: z.string().trim().min(1).max(4096),
  domain: z.string().trim().min(1).max(300),
}).strict();

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
  const { data: existing, error: lookupError } = await supabase
    .from("lms_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("platform", "canvas")
    .eq("canvas_domain", canvas_domain)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("lms_connections")
      .update({
        access_token,
        refresh_token: refresh_token ?? null,
        platform_user_id: platform_user_id ?? null,
        platform_email: platform_email ?? null,
        scopes: scopes ?? null,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (updateError) throw updateError;
    return existing.id;
  }

  const { data: newConn, error: insertError } = await supabase
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
  if (insertError) throw insertError;

  return newConn?.id ?? null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // ---- OAuth Callback ----
  if (code && state) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/login", req.url));

    let canvasDomain: string;
    try {
      canvasDomain = verifyCanvasOAuthState(
        state,
        req.cookies.get(CANVAS_STATE_COOKIE)?.value
      ).domain;
    } catch (stateError) {
      console.warn("[Canvas OAuth] State verification failed:", stateError);
      const response = NextResponse.redirect(
        new URL("/settings?error=canvas_oauth_state_invalid", req.url)
      );
      response.cookies.delete(CANVAS_STATE_COOKIE);
      return response;
    }

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
      signal: AbortSignal.timeout(15_000),
    });

    if (!tokenRes.ok) {
      console.error("Canvas token exchange failed with status:", tokenRes.status);
      return NextResponse.redirect(new URL("/settings?error=canvas_auth_failed", req.url));
    }

    const tokens = await tokenRes.json() as {
      access_token?: string;
      refresh_token?: string;
    };
    if (!tokens.access_token) {
      return NextResponse.redirect(new URL("/settings?error=canvas_auth_failed", req.url));
    }

    // Get Canvas user profile
    const profileRes = await fetch(`https://${canvasDomain}/api/v1/users/self/profile`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(15_000),
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
    const response = NextResponse.redirect(
      new URL(`/settings?connected=canvas${syncParam}`, req.url)
    );
    response.cookies.delete(CANVAS_STATE_COOKIE);
    return response;
  }

  if (error) {
    return NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent(error)}`, req.url));
  }

  // ---- Initiate OAuth ----
  if (!process.env.CANVAS_CLIENT_ID || !process.env.CANVAS_CLIENT_SECRET) {
    return NextResponse.redirect(new URL("/settings?error=canvas_not_configured", req.url));
  }

  const rawDomain = searchParams.get("domain");
  let domain: string;
  try {
    domain = normalizeCanvasDomain(rawDomain ?? "", { forOAuth: true });
  } catch {
    return NextResponse.redirect(
      new URL("/settings?error=canvas_domain_invalid", req.url)
    );
  }

  const { state: oauthState, cookieNonce } = createCanvasOAuthState(domain);
  const authUrl = new URL(`https://${domain}/login/oauth2/auth`);
  authUrl.searchParams.set("client_id", process.env.CANVAS_CLIENT_ID);
  authUrl.searchParams.set(
    "redirect_uri",
    `${process.env.NEXT_PUBLIC_APP_URL}/api/lms/canvas`
  );
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", oauthState);
  // Omitting "scope" requests all permissions granted to the developer key

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set(CANVAS_STATE_COOKIE, cookieNonce, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/api/lms/canvas",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
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

    const parsedBody = canvasTokenSchema.safeParse(
      await req.json().catch(() => null)
    );
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "A valid Canvas domain and access token are required." },
        { status: 400 }
      );
    }
    let domain: string;
    try {
      domain = normalizeCanvasDomain(parsedBody.data.domain, { forOAuth: true });
    } catch (domainError) {
      return NextResponse.json(
        { error: domainError instanceof Error ? domainError.message : "Invalid Canvas domain." },
        { status: 400 }
      );
    }
    const accessToken = parsedBody.data.access_token;

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
    console.error("[Canvas] Connection failed:", err);
    return NextResponse.json({ error: "Failed to connect Canvas." }, { status: 500 });
  }
}
