import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type AuthRouteClient =
  | {
      supabase: ReturnType<typeof createServerClient>;
      applyCookies: (response: NextResponse) => NextResponse;
    }
  | {
      errorResponse: NextResponse;
    };

function missingSupabaseResponse() {
  return NextResponse.json(
    {
      error:
        "Authentication is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart the dev server.",
    },
    { status: 500 }
  );
}

export function createAuthRouteClient(request: NextRequest): AuthRouteClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { errorResponse: missingSupabaseResponse() };
  }

  const cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[] = [];

  const supabase = createServerClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(nextCookies: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.push(...nextCookies);
      },
    },
  });

  return {
    supabase,
    applyCookies(response) {
      cookiesToSet.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });
      return response;
    },
  };
}

export function authUnavailableResponse(error: unknown) {
  const message =
    error instanceof Error && error.message !== "Failed to fetch"
      ? error.message
      : "Authentication server is unreachable. Confirm your Supabase project URL is live, then restart the dev server.";

  console.error("[Auth] Supabase request failed:", error);

  return NextResponse.json({ error: message }, { status: 503 });
}
