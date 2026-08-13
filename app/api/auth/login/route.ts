import { NextResponse, type NextRequest } from "next/server";
import { authUnavailableResponse, createAuthRouteClient } from "../_supabase-route";
import { loginInputSchema } from "@/backend/security/authInput";

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
  const captchaToken = parsed.data.captchaToken;

  const authClient = createAuthRouteClient(request);
  if ("errorResponse" in authClient) {
    return authClient.errorResponse;
  }

  try {
    const { error } = await authClient.supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken },
    });

    if (error) {
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

    return authClient.applyCookies(NextResponse.json({ ok: true }));
  } catch (error) {
    return authUnavailableResponse(error);
  }
}
