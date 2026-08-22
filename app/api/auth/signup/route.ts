import { NextResponse, type NextRequest } from "next/server";
import { authUnavailableResponse, createAuthRouteClient } from "../_supabase-route";
import { signupInputSchema } from "@/backend/security/authInput";

const USERNAME_TAKEN_MESSAGE =
  "That username is already taken. Please choose another one.";

function isUsernameConflict(message: string): boolean {
  return /username/i.test(message) && /already|duplicate|unique|taken/i.test(message);
}

export async function POST(request: NextRequest) {
  const parsed = signupInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Use a valid email, a 3–50 character username, and a password of at least 8 characters.",
      },
      { status: 400 }
    );
  }
  const { email, password, username } = parsed.data;
  // Turnstile token — verified by Supabase when CAPTCHA protection is enabled
  // in the project's Auth settings; ignored otherwise.
  const captchaToken = parsed.data.captchaToken ?? undefined;

  const authClient = createAuthRouteClient(request);
  if ("errorResponse" in authClient) {
    return authClient.errorResponse;
  }

  try {
    // This preflight produces a useful validation message. The database's
    // case-insensitive unique index remains the race-safe source of truth.
    const { data: usernameAvailable, error: usernameCheckError } =
      await authClient.supabase.rpc("is_username_available", {
        candidate_username: username,
      });
    if (usernameCheckError) {
      console.error("[Auth] Username availability check failed:", usernameCheckError);
      return NextResponse.json(
        { error: "Could not verify that username. Please try again." },
        { status: 503 }
      );
    }
    if (usernameAvailable !== true) {
      return NextResponse.json(
        { error: USERNAME_TAKEN_MESSAGE, code: "USERNAME_TAKEN" },
        { status: 409 }
      );
    }

    const { data, error } = await authClient.supabase.auth.signUp({
      email,
      password,
      options: {
        // Store the username as the profile display name so it shows across the app,
        // and keep it under `username` in metadata for clarity.
        data: { full_name: username, username },
        captchaToken,
        emailRedirectTo: new URL(
          `/callback?next=${encodeURIComponent("/onboarding?welcome=1")}`,
          process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
        ).toString(),
      },
    });

    if (error) {
      if (isUsernameConflict(error.message)) {
        return NextResponse.json(
          { error: USERNAME_TAKEN_MESSAGE, code: "USERNAME_TAKEN" },
          { status: 409 }
        );
      }
      const isRateLimited = error.status === 429;
      return NextResponse.json(
        {
          error: isRateLimited
            ? "Too many signup attempts. Please wait a moment and try again."
            : error.message,
        },
        { status: isRateLimited ? 429 : 400 }
      );
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
