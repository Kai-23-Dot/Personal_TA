import { NextResponse, type NextRequest } from "next/server";
import { authUnavailableResponse, createAuthRouteClient } from "../_supabase-route";

const supportedProviders = new Set(["google", "github", "azure"]);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const provider = typeof body?.provider === "string" ? body.provider : "";
  const redirectTo =
    typeof body?.redirectTo === "string" ? body.redirectTo : `${request.nextUrl.origin}/callback`;

  if (!supportedProviders.has(provider)) {
    return NextResponse.json({ error: "Unsupported sign-in provider." }, { status: 400 });
  }

  const authClient = createAuthRouteClient(request);
  if ("errorResponse" in authClient) {
    return authClient.errorResponse;
  }

  try {
    const { data, error } = await authClient.supabase.auth.signInWithOAuth({
      provider: provider as "google" | "github" | "azure",
      options: { redirectTo },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return authClient.applyCookies(NextResponse.json({ url: data.url }));
  } catch (error) {
    return authUnavailableResponse(error);
  }
}
