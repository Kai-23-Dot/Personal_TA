/**
 * GET  /api/notebooks → the student's notebooks, with a source count each
 * POST /api/notebooks → create one
 */
import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  // Optional: attaching a notebook to a course makes anything generated from
  // it show up in that course's existing surfaces.
  courseId: z.string().uuid().nullable().optional(),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("notebooks")
    .select("id, title, description, course_id, created_at, updated_at, sources:notes(count), course:courses(name)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[notebooks] List failed:", error);
    return NextResponse.json({ error: "Could not load your notebooks." }, { status: 500 });
  }

  return NextResponse.json(
    (data ?? []).map((n) => ({
      id: n.id,
      title: n.title,
      description: n.description,
      courseId: n.course_id,
      courseName: (n.course as { name?: string } | null)?.name ?? null,
      sourceCount: (n.sources as unknown as { count: number }[])?.[0]?.count ?? 0,
      updatedAt: n.updated_at,
    }))
  );
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Give the notebook a name." }, { status: 400 });
  }

  const { title, description, courseId } = parsed.data;

  // A notebook may only point at a course the student actually owns.
  if (courseId) {
    const { data: course } = await supabase
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!course) {
      return NextResponse.json({ error: "That course was not found." }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("notebooks")
    .insert({
      user_id: user.id,
      title,
      description: description || null,
      course_id: courseId ?? null,
    })
    .select("id, title, description, course_id")
    .single();

  if (error) {
    console.error("[notebooks] Create failed:", error);
    return NextResponse.json({ error: "Could not create that notebook." }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id,
    title: data.title,
    description: data.description,
    courseId: data.course_id,
    sourceCount: 0,
  });
}
