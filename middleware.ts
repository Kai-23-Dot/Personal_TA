import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  checkRateLimit,
  type RateLimitResult,
  type RateLimitRule,
} from "@/backend/security/requestProtection";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ONE_MINUTE = 60_000;
const ONE_HOUR = 60 * ONE_MINUTE;

function clientIdentifier(request: NextRequest): string {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim().slice(0, 64);
  if (ip) return ip;

  // This is mainly used in local development. Vercel supplies the headers above.
  return `unknown:${(request.headers.get("user-agent") ?? "none").slice(0, 80)}`;
}

function isSameOrigin(request: NextRequest, origin: string): boolean {
  try {
    const parsedOrigin = new URL(origin);
    const requestHost = request.headers.get("host");
    const forwardedProto = request.headers.get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim();
    const requestProtocol = forwardedProto
      ? `${forwardedProto}:`
      : request.nextUrl.protocol;

    return parsedOrigin.host === requestHost && parsedOrigin.protocol === requestProtocol;
  } catch {
    return false;
  }
}

function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(result.retryAfterSeconds),
        "RateLimit-Limit": String(result.limit),
        "RateLimit-Remaining": String(result.remaining),
        "RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    }
  );
}

function rejectJson(status: number, error: string): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function requestSizeLimit(pathname: string): number {
  if (pathname === "/api/billing/webhook") return 1_000_000;
  if (pathname === "/api/chat" || pathname === "/api/chat/context") return 4_000_000;
  if (
    pathname.includes("/upload") ||
    pathname.includes("/extract") ||
    pathname.includes("/transcribe") ||
    pathname.includes("/ocr") ||
    pathname.includes("/import-canvas-file")
  ) {
    return 26_000_000;
  }
  return 1_000_000;
}

function sensitiveAnonymousRule(pathname: string, method: string): RateLimitRule | null {
  if (method === "POST" && pathname === "/api/auth/login") {
    return { limit: 8, windowMs: 5 * ONE_MINUTE };
  }
  if (method === "POST" && pathname === "/api/auth/signup") {
    return { limit: 4, windowMs: ONE_HOUR };
  }
  if (method === "POST" && pathname === "/api/auth/password-reset") {
    return { limit: 4, windowMs: ONE_HOUR };
  }
  if (method === "POST" && pathname === "/api/auth/resend-confirmation") {
    return { limit: 4, windowMs: ONE_HOUR };
  }
  if (method === "POST" && pathname === "/api/auth/oauth") {
    return { limit: 10, windowMs: 10 * ONE_MINUTE };
  }
  return null;
}

function isExpensiveRoute(pathname: string): boolean {
  return [
    "/api/chat",
    "/api/assignments/parse",
    "/api/assignments/summary",
    "/api/flashcards/generate",
    "/api/notes/extract",
    "/api/notes/generate-materials",
    "/api/notes/ocr",
    "/api/notes/study-guide",
    "/api/notes/summarize",
    "/api/notes/transcribe",
    "/api/planner/generate",
    "/api/practice/extract",
    "/api/practice/generate",
    "/api/retrieval/evaluate",
    "/api/rubrics/evaluate",
    "/api/syllabus/extract",
    "/api/sync",
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const isApiRoute = pathname.startsWith("/api");
  const isPrefetch =
    request.headers.get("purpose") === "prefetch" ||
    request.headers.has("next-router-prefetch");
  const publicRoutes = new Set([
    "/",
    "/login",
    "/signup",
    "/forgot-password",
    "/callback",
    "/about",
    "/contact",
    "/website",
    "/privacy",
    "/terms",
    "/manifest.webmanifest",
    "/icon.svg",
  ]);
  const isPublicRoute =
    publicRoutes.has(pathname) ||
    pathname.startsWith("/api/auth/") ||
    // Stripe posts webhooks unauthenticated; signature is verified in the route.
    pathname === "/api/billing/webhook";
  const cookieKeys = request.cookies.getAll().map((cookie) => cookie.name);
  // Supabase SSR splits large session cookies (common with OAuth providers like
  // Google, whose tokens carry extra provider claims) into `<name>.0`, `<name>.1`,
  // etc. once the encoded value exceeds ~3180 bytes — so this must match chunked
  // names too, not just the exact `-auth-token` suffix.
  const hasAuthCookie = cookieKeys.some(
    (name) =>
      (name.startsWith("sb-") && /-auth-token(\.\d+)?$/.test(name)) ||
      name === "sb-access-token" ||
      name === "supabase-auth-token"
  );

  if (isApiRoute) {
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > requestSizeLimit(pathname)) {
      return rejectJson(413, "Request body is too large.");
    }

    // Block browser cross-site state changes. Requests without Origin/Sec-Fetch-
    // Site remain available to authenticated server clients and signed webhooks.
    if (UNSAFE_METHODS.has(request.method) && pathname !== "/api/billing/webhook") {
      const fetchSite = request.headers.get("sec-fetch-site");
      const origin = request.headers.get("origin");
      if (fetchSite === "cross-site" || (origin && !isSameOrigin(request, origin))) {
        return rejectJson(403, "Cross-site request blocked.");
      }
    }

    const ip = clientIdentifier(request);
    const globalResult = checkRateLimit(`ip:${ip}:api`, {
      limit: 180,
      windowMs: ONE_MINUTE,
    });
    if (!globalResult.allowed) return rateLimitResponse(globalResult);

    const sensitiveRule = sensitiveAnonymousRule(pathname, request.method);
    if (sensitiveRule) {
      const sensitiveResult = checkRateLimit(
        `ip:${ip}:${request.method}:${pathname}`,
        sensitiveRule
      );
      if (!sensitiveResult.allowed) return rateLimitResponse(sensitiveResult);
    }
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (isPublicRoute) return supabaseResponse;
    return NextResponse.json(
      { error: "Authentication service is not configured." },
      { status: 503 }
    );
  }

  // Page prefetches are guarded again by the authenticated dashboard layout.
  // Never let a caller bypass API middleware merely by spoofing this header.
  if (isPrefetch && !isApiRoute) {
    return supabaseResponse;
  }

  // Avoid auth network calls unless a protected route has a session cookie.
  if (!isPublicRoute && !hasAuthCookie) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Public routes without auth cookies do not need Supabase calls.
  if (isPublicRoute && !hasAuthCookie) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user = null;
  try {
    const {
      data: { user: fetchedUser },
      error,
    } = await supabase.auth.getUser();
    
    if (error) {
      // Auth error - check if we have a valid session cookie
      throw error;
    }
    
    user = fetchedUser;
  } catch (error) {
    const isNetworkError = 
      error instanceof Error && 
      (error.message.includes('fetch failed') || 
       error.message.includes('ENOTFOUND') ||
       error.message.includes('ECONNREFUSED') ||
       error.message.includes('ETIMEDOUT'));
    
    if (isNetworkError) {
      console.error("[Middleware] Supabase authentication unavailable:", error.message);
      if (isPublicRoute) return supabaseResponse;
      return NextResponse.json(
        { error: "Authentication service is temporarily unavailable." },
        { status: 503 }
      );
    }
    
    if (isPublicRoute) return supabaseResponse;
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "session_expired");
    return NextResponse.redirect(url);
  }

  if (!user && !isPublicRoute) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Email/password accounts must activate through the confirmation link before
  // reaching any protected page or API. This backs up the Auth provider setting
  // and prevents an accidentally issued unverified session from being useful.
  if (user && !user.email_confirmed_at && !isPublicRoute) {
    if (isApiRoute) {
      return NextResponse.json(
        {
          error: "Verify your email before continuing.",
          code: "EMAIL_NOT_VERIFIED",
        },
        { status: 403 }
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "email_not_verified");
    return NextResponse.redirect(url);
  }

  if (user && isApiRoute && !isPublicRoute) {
    const userRule = isExpensiveRoute(pathname)
      ? { limit: 20, windowMs: ONE_MINUTE }
      : { limit: 120, windowMs: ONE_MINUTE };
    const result = checkRateLimit(
      `user:${user.id}:${request.method}:${isExpensiveRoute(pathname) ? "expensive" : "api"}`,
      userRule
    );
    if (!result.allowed) return rateLimitResponse(result);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
