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
import { z } from "zod";

const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
const courseFieldsSchema = z.object({
  color: colorSchema.optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  is_active: z.boolean().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  section: z.string().trim().max(100).nullable().optional(),
  teacher_email: z.union([
    z.literal(""),
    z.string().trim().email().max(254),
    z.null(),
  ]).optional(),
  teacher_name: z.string().trim().max(160).nullable().optional(),
});
const createCourseSchema = courseFieldsSchema.extend({
  name: z.string().trim().min(1).max(200),
}).strict();
const updateCourseSchema = courseFieldsSchema.extend({
  id: z.string().uuid(),
}).strict().refine(
  (value) => Object.keys(value).some((key) => key !== "id"),
  "At least one course field is required."
);

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

  if (error) {
    console.error("[courses] List failed:", error);
    return NextResponse.json({ error: "Failed to load courses." }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createCourseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid course details." }, { status: 400 });
  }
  const { name, teacher_name, teacher_email, section, color, description } = parsed.data;

  const { data, error } = await supabase
    .from("courses")
    .insert({
      user_id: user.id,
      platform: "manual",
      name,
      teacher_name: teacher_name || null,
      teacher_email: teacher_email || null,
      section: section || null,
      color: color || "#6366f1",
      description: description || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error("[courses] Create failed:", error);
    return NextResponse.json({ error: "Failed to create course." }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateCourseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid course update." }, { status: 400 });
  }
  const { id, ...updates } = parsed.data;

  const { data, error } = await supabase
    .from("courses")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    console.error("[courses] Update failed:", error);
    return NextResponse.json({ error: "Failed to update course." }, { status: 500 });
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
    return NextResponse.json({ error: "A valid course id is required." }, { status: 400 });
  }

  // Soft delete — keeps assignments intact
  const { error } = await supabase
    .from("courses")
    .update({ is_active: false })
    .eq("id", parsedId.data)
    .eq("user_id", user.id);

  if (error) {
    console.error("[courses] Delete failed:", error);
    return NextResponse.json({ error: "Failed to remove course." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
