import { NextResponse, type NextRequest } from "next/server";
import { authUnavailableResponse, createAuthRouteClient } from "../_supabase-route";
import { loginInputSchema } from "@/backend/security/authInput";

const EMAIL_NOT_VERIFIED_MESSAGE =
  "Verify your email before signing in. Open the confirmation link we sent to your inbox, then try again.";

function isEmailNotVerified(error: { code?: string; message?: string }): boolean {
  return error.code === "email_not_confirmed" ||
    /email(?: address)? (?:is )?not confirmed|confirm your email/i.test(error.message ?? "");
}

export async function POST(request: NextRequest) {
  const parsed = loginInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email and password." },
      { status: 400 }
    );
  }
  const { email, password } = parsed.data;
  // Turnstile token — verified by Supabase when CAPTCHA protection is enabled
  // in the project's Auth settings; ignored otherwise.
  const captchaToken = parsed.data.captchaToken ?? undefined;

  const authClient = createAuthRouteClient(request);
  if ("errorResponse" in authClient) {
    return authClient.errorResponse;
  }

  try {
    const { data, error } = await authClient.supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });

    if (error) {
      if (isEmailNotVerified(error)) {
        return NextResponse.json(
          {
            error: EMAIL_NOT_VERIFIED_MESSAGE,
            code: "EMAIL_NOT_VERIFIED",
          },
          { status: 403 }
        );
      }
      const isRateLimited = error.status === 429;
      return NextResponse.json(
        {
          error: isRateLimited
            ? "Too many sign-in attempts. Please wait a moment and try again."
            : error.message,
        },
        { status: isRateLimited ? 429 : 401 }
      );
    }

    // Keep this defense-in-depth check even though Supabase also blocks
    // unverified email/password users at the provider level.
    if (!data.user?.email_confirmed_at) {
      await authClient.supabase.auth.signOut({ scope: "local" });
      return authClient.applyCookies(
        NextResponse.json(
          {
            error: EMAIL_NOT_VERIFIED_MESSAGE,
            code: "EMAIL_NOT_VERIFIED",
          },
          { status: 403 }
        )
      );
    }

    return authClient.applyCookies(NextResponse.json({ ok: true }));
  } catch (error) {
    return authUnavailableResponse(error);
  }
}
