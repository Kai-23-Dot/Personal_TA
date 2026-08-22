import { NextResponse, type NextRequest } from "next/server";
import { resendConfirmationInputSchema } from "@/backend/security/authInput";
import {
  authUnavailableResponse,
  createAuthRouteClient,
} from "../_supabase-route";

export async function POST(request: NextRequest) {
  const parsed = resendConfirmationInputSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  const authClient = createAuthRouteClient(request);
  if ("errorResponse" in authClient) return authClient.errorResponse;

  try {
    const redirectUrl = new URL(
      `/callback?next=${encodeURIComponent("/onboarding?welcome=1")}`,
      process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin
    ).toString();
    const { error } = await authClient.supabase.auth.resend({
      type: "signup",
      email: parsed.data.email,
      options: {
        emailRedirectTo: redirectUrl,
        captchaToken: parsed.data.captchaToken,
      },
    });

    if (error) {
      const isRateLimited = error.status === 429 ||
        /rate limit|too many/i.test(error.message);
      if (isRateLimited) {
        return NextResponse.json(
          { error: "A verification email was sent recently. Please wait before requesting another." },
          { status: 429 }
        );
      }
      // Avoid revealing whether an email address has an account.
      console.warn("[Auth] Verification resend was not accepted:", error.message);
    }

    return NextResponse.json({
      ok: true,
      message: "If that account still needs verification, a new link is on its way.",
    });
  } catch (error) {
    return authUnavailableResponse(error);
  }
}
