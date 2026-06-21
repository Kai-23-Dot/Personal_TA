/**
 * /api/courses — CRUD for manually managed courses.
 *
 * GET    → list all courses for the current user
 * POST   → create a manual course
 * PATCH  → update a course (name, color, teacher, etc.)
 * DELETE → soft-delete (is_active = false) or hard-delete
 */
import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, teacher_name, teacher_email, section, color, description } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Course name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("courses")
    .insert({
      user_id: user.id,
      platform: "manual",
      name: name.trim(),
      teacher_name: teacher_name?.trim() || null,
      teacher_email: teacher_email?.trim() || null,
      section: section?.trim() || null,
      color: color || "#6366f1",
      description: description?.trim() || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...fields } = body;

  if (!id) return NextResponse.json({ error: "Course id required" }, { status: 400 });

  // Strip out fields that shouldn't be user-editable here
  const allowed = ["name", "teacher_name", "teacher_email", "section", "color", "description", "is_active"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in fields) updates[key] = fields[key];
  }

  const { data, error } = await supabase
    .from("courses")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Soft delete — keeps assignments intact
  const { error } = await supabase
    .from("courses")
    .update({ is_active: false })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
