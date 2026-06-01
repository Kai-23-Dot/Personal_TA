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
    "/callback",
    "/about",
    "/contact",
    "/website",
    "/privacy",
    "/terms",
    "/manifest.webmanifest",
    "/icon.svg",
  ]);
  const isPublicRoute = publicRoutes.has(pathname);
  const cookieKeys = request.cookies.getAll().map((cookie) => cookie.name);
  const hasAuthCookie = cookieKeys.some(
    (name) =>
      (name.startsWith("sb-") && name.endsWith("-auth-token")) ||
      name === "sb-access-token" ||
      name === "supabase-auth-token"
  );

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return supabaseResponse;
  }

  if (isPrefetch) {
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
    // Avoid hard-failing middleware on network/auth errors.
    // This is especially important during build time or when Supabase is unreachable
    const isNetworkError = 
      error instanceof Error && 
      (error.message.includes('fetch failed') || 
       error.message.includes('ENOTFOUND') ||
       error.message.includes('ECONNREFUSED') ||
       error.message.includes('ETIMEDOUT'));
    
    // If auth refresh fails repeatedly, clear stale auth cookies to stop retry loops.
    if (isNetworkError) {
      cookieKeys.forEach((name) => {
        if (name.startsWith("sb-") || name.startsWith("supabase-")) {
          supabaseResponse.cookies.delete(name);
        }
      });
    }

    // If it's a network error, allow the request to continue after cleanup.
    if (isNetworkError) {
      console.warn(
        "[Middleware] Supabase network error, cleared stale auth cookies and allowing request:",
        error.message
      );
      return supabaseResponse;
    }
    
    if (!hasAuthCookie) {
      if (isApiRoute) {
        return supabaseResponse;
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
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
