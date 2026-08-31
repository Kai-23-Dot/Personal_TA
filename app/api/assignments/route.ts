/**
 * /api/assignments — CRUD for manually managed assignments.
 *
 * GET    → list assignments (optionally filtered by course_id)
 * POST   → create a manual assignment
 * PATCH  → update an assignment (title, due date, completed, etc.)
 * DELETE → hard-delete a manual assignment
 */
import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { z } from "zod";

const assignmentTypeSchema = z.enum([
  "homework",
  "quiz",
  "test",
  "exam",
  "project",
  "lab",
  "essay",
  "discussion",
  "reading",
  "other",
]);
const dateSchema = z.string().max(64).refine(
  (value) => Number.isFinite(Date.parse(value)),
  "Invalid date."
);
const assignmentFieldsSchema = z.object({
  assignment_type: assignmentTypeSchema.optional(),
  course_id: z.string().uuid().optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  due_date: dateSchema.nullable().optional(),
  estimated_minutes: z.number().int().min(0).max(100_000).nullable().optional(),
  is_completed: z.boolean().optional(),
  points_possible: z.number().min(0).max(1_000_000).nullable().optional(),
  title: z.string().trim().min(1).max(300).optional(),
});
const createAssignmentSchema = assignmentFieldsSchema.extend({
  course_id: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
}).strict();
const updateAssignmentSchema = assignmentFieldsSchema.extend({
  id: z.string().uuid(),
}).strict().refine(
  (value) => Object.keys(value).some((key) => key !== "id"),
  "At least one assignment field is required."
);

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("course_id") ?? searchParams.get("courseId");

  let query = supabase
    .from("assignments")
    .select("*, course:courses!inner(id, name, color, is_active)")
    .eq("user_id", user.id)
    .eq("course.is_active", true)
    .or(`due_date.is.null,due_date.gte.${new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()}`)
    .order("due_date", { ascending: false, nullsFirst: false });

  if (courseId) {
    const parsedCourseId = z.string().uuid().safeParse(courseId);
    if (!parsedCourseId.success) {
      return NextResponse.json({ error: "Invalid course id." }, { status: 400 });
    }
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id")
      .eq("id", parsedCourseId.data)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (courseError) {
      console.error("[assignments] Course lookup failed:", courseError);
      return NextResponse.json({ error: "Failed to load assignments." }, { status: 500 });
    }
    if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

    query = query.eq("course_id", parsedCourseId.data);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[assignments] List failed:", error);
    return NextResponse.json({ error: "Failed to load assignments." }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createAssignmentSchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid assignment details." }, { status: 400 });
  }
  const {
    course_id,
    title,
    description,
    assignment_type,
    due_date,
    points_possible,
    estimated_minutes,
  } = parsed.data;

  // Verify the course belongs to this user
  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("id", course_id)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("assignments")
    .insert({
      user_id: user.id,
      course_id,
      title,
      description: description || null,
      assignment_type: assignment_type || "homework",
      due_date: due_date || null,
      points_possible: points_possible ?? null,
      estimated_minutes: estimated_minutes ?? null,
      is_completed: false,
    })
    .select()
    .single();

  if (error) {
    console.error("[assignments] Create failed:", error);
    return NextResponse.json({ error: "Failed to create assignment." }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateAssignmentSchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid assignment update." }, { status: 400 });
  }
  const { id, ...validatedUpdates } = parsed.data;
  const updates: Record<string, unknown> = { ...validatedUpdates };

  if (validatedUpdates.course_id) {
    const { data: destinationCourse } = await supabase
      .from("courses")
      .select("id")
      .eq("id", validatedUpdates.course_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!destinationCourse) {
      return NextResponse.json({ error: "Destination course not found." }, { status: 404 });
    }
  }
  if (validatedUpdates.is_completed === true) {
    updates.completed_at = new Date().toISOString();
  } else if (validatedUpdates.is_completed === false) {
    updates.completed_at = null;
  }

  const { data, error } = await supabase
    .from("assignments")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    console.error("[assignments] Update failed:", error);
    return NextResponse.json({ error: "Failed to update assignment." }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "A valid assignment id is required." }, { status: 400 });
  }

  const { error } = await supabase
    .from("assignments")
    .delete()
    .eq("id", parsedId.data)
    .eq("user_id", user.id);

  if (error) {
    console.error("[assignments] Delete failed:", error);
    return NextResponse.json({ error: "Failed to delete assignment." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
