import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, school_name, grade_level, timezone, preferred_subjects, role, email")
    .eq("id", user.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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

  const body = await req.json();
  const {
    full_name,
    school_name,
    grade_level,
    timezone,
    preferred_subjects,
    role,
  } = body as {
    full_name?: string | null;
    school_name?: string | null;
    grade_level?: number | null;
    timezone?: string | null;
    preferred_subjects?: string[] | null;
    role?: "student" | "teacher" | null;
  };

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, profile: data });
}
