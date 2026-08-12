import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  authUnavailableResponse,
  createAuthRouteClient,
} from "../_supabase-route";

const resetRequestSchema = z.object({
  email: z.string().trim().email().max(254),
}).strict();

export async function POST(request: NextRequest) {
  const parsed = resetRequestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const authClient = createAuthRouteClient(request);
  if ("errorResponse" in authClient) return authClient.errorResponse;

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json(
        { error: "Password recovery is not configured." },
        { status: 503 }
      );
    }

    const redirectUrl = new URL("/callback", appUrl);
    redirectUrl.searchParams.set("next", "/reset-password");

    const { error } = await authClient.supabase.auth.resetPasswordForEmail(
      parsed.data.email,
      { redirectTo: redirectUrl.toString() }
    );
    if (error) {
      // Do not reveal whether the address exists or provider-specific details.
      console.warn("[Auth] Password reset request was not accepted:", error.message);
    }

    return NextResponse.json({
      ok: true,
      message: "If an account exists for that email, a reset link is on its way.",
    });
  } catch (error) {
    return authUnavailableResponse(error);
  }
}
