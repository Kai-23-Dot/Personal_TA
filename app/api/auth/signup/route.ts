import { NextResponse, type NextRequest } from "next/server";
import { authUnavailableResponse, createAuthRouteClient } from "../_supabase-route";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username || !email || !password) {
    return NextResponse.json({ error: "Enter a username, email, and password." }, { status: 400 });
  }

  if (username.length < 3) {
    return NextResponse.json({ error: "Username must be at least 3 characters." }, { status: 400 });
  }

  const authClient = createAuthRouteClient(request);
  if ("errorResponse" in authClient) {
    return authClient.errorResponse;
  }

  try {
    const { data, error } = await authClient.supabase.auth.signUp({
      email,
      password,
      options: {
        // Store the username as the profile display name so it shows across the app,
        // and keep it under `username` in metadata for clarity.
        data: { full_name: username, username },
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Supabase only returns an active session immediately when email confirmation
    // is disabled for the project; otherwise `data.session` is null until the user
    // clicks the confirmation link. Tell the frontend which case this is so it can
    // skip the redundant login step when a session already exists.
    return authClient.applyCookies(
      NextResponse.json({ ok: true, hasSession: Boolean(data.session) })
    );
  } catch (error) {
    return authUnavailableResponse(error);
  }
}
