import { NextResponse, type NextRequest } from "next/server";
import { authUnavailableResponse, createAuthRouteClient } from "../_supabase-route";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!fullName || !email || !password) {
    return NextResponse.json({ error: "Enter your name, email, and password." }, { status: 400 });
  }

  const authClient = createAuthRouteClient(request);
  if ("errorResponse" in authClient) {
    return authClient.errorResponse;
  }

  try {
    const { error } = await authClient.supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return authClient.applyCookies(NextResponse.json({ ok: true }));
  } catch (error) {
    return authUnavailableResponse(error);
  }
}
