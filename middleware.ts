import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
