import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { z } from "zod";

const profileSchema = z.object({
  full_name: z.string().trim().max(100).nullable().optional(),
  grade_level: z.number().int().min(1).max(20).nullable().optional(),
  preferred_subjects: z.array(z.string().trim().min(1).max(80)).max(20).nullable().optional(),
  role: z.enum(["student", "teacher"]).nullable().optional(),
  school_name: z.string().trim().max(160).nullable().optional(),
  timezone: z.string().trim().min(1).max(80).nullable().optional().refine(
    (value) => {
      if (!value) return true;
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    },
    "Invalid timezone."
  ),
}).strict();

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, school_name, grade_level, timezone, preferred_subjects, role, email")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("[profile] Load failed:", error);
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }
  return NextResponse.json(data ?? {
    full_name: null,
    school_name: null,
    grade_level: null,
    timezone: "America/New_York",
    preferred_subjects: [],
    role: "student",
    email: user.email,
  });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = profileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile details." }, { status: 400 });
  }
  const {
    full_name,
    school_name,
    grade_level,
    timezone,
    preferred_subjects,
    role,
  } = parsed.data;

  const update = {
    full_name: full_name ?? null,
    school_name: school_name ?? null,
    grade_level: grade_level ?? null,
    timezone: timezone ?? "America/New_York",
    preferred_subjects: preferred_subjects ?? [],
    role: role ?? "student",
  };

  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    console.error("[profile] Update failed:", error);
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }
  return NextResponse.json({ success: true, profile: data });
}
