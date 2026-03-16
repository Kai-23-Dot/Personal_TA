/**
 * /api/assignments — CRUD for manually managed assignments.
 *
 * GET    → list assignments (optionally filtered by course_id)
 * POST   → create a manual assignment
 * PATCH  → update an assignment (title, due date, completed, etc.)
 * DELETE → hard-delete a manual assignment
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("course_id");

  let query = supabase
    .from("assignments")
    .select("*, course:courses(name, color)")
    .eq("user_id", user.id)
    .order("due_date", { ascending: true });

  if (courseId) query = query.eq("course_id", courseId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    course_id,
    title,
    description,
    assignment_type,
    due_date,
    points_possible,
    estimated_minutes,
  } = body;

  if (!course_id) return NextResponse.json({ error: "course_id required" }, { status: 400 });
  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });

  // Verify the course belongs to this user
  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("id", course_id)
    .eq("user_id", user.id)
    .single();

  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("assignments")
    .insert({
      user_id: user.id,
      course_id,
      title: title.trim(),
      description: description?.trim() || null,
      assignment_type: assignment_type || "homework",
      due_date: due_date || null,
      points_possible: points_possible ?? null,
      estimated_minutes: estimated_minutes ?? null,
      is_completed: false,
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
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const allowed = [
    "title", "description", "assignment_type", "due_date",
    "points_possible", "estimated_minutes", "is_completed", "completed_at", "course_id",
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in fields) updates[key] = fields[key];
  }
  if (updates.is_completed === true && !updates.completed_at) {
    updates.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("assignments")
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

  const { error } = await supabase
    .from("assignments")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
