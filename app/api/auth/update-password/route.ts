import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  authUnavailableResponse,
  createAuthRouteClient,
} from "../_supabase-route";

const updatePasswordSchema = z.object({
  password: z.string().min(8).max(128),
}).strict();

export async function POST(request: NextRequest) {
  const parsed = updatePasswordSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Password must be between 8 and 128 characters." },
      { status: 400 }
    );
  }

  const authClient = createAuthRouteClient(request);
  if ("errorResponse" in authClient) return authClient.errorResponse;

  try {
    const { data: { user }, error: userError } =
      await authClient.supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired." },
        { status: 401 }
      );
    }

    const { error } = await authClient.supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (error) {
      return NextResponse.json(
        { error: "Could not update the password. Request a new reset link." },
        { status: 400 }
      );
    }

    return authClient.applyCookies(NextResponse.json({ ok: true }));
  } catch (error) {
    return authUnavailableResponse(error);
  }
}
