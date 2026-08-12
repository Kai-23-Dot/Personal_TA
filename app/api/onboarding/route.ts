import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { z } from "zod";

const onboardingSchema = z.object({
  completed: z.boolean().optional(),
  steps: z.record(z.string().max(80), z.boolean()).optional().refine(
    (steps) => !steps || Object.keys(steps).length <= 30,
    "Too many onboarding steps."
  ),
}).strict();

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("user_onboarding")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[onboarding] Load failed:", error);
    return NextResponse.json({ error: "Failed to load onboarding status." }, { status: 500 });
  }
  return NextResponse.json(data ?? { user_id: user.id, completed: false, steps: {} });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = onboardingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid onboarding update." }, { status: 400 });
  }
  const { completed, steps } = parsed.data;

  const { data, error } = await supabase
    .from("user_onboarding")
    .upsert(
      {
        user_id: user.id,
        completed: completed ?? false,
        steps: steps ?? {},
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("[onboarding] Update failed:", error);
    return NextResponse.json({ error: "Failed to update onboarding status." }, { status: 500 });
  }
  return NextResponse.json({ success: true, onboarding: data });
}
