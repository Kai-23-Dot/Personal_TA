import { NextResponse, type NextRequest } from "next/server";
import { authUnavailableResponse, createAuthRouteClient } from "../_supabase-route";
import { z } from "zod";

const loginSchema = z.object({
  captchaToken: z.string().max(4096).optional(),
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(1024),
}).strict();

export async function POST(request: NextRequest) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
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
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return authClient.applyCookies(NextResponse.json({ ok: true }));
  } catch (error) {
    return authUnavailableResponse(error);
  }
}
