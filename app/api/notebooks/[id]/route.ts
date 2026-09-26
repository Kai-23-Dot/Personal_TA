/**
 * GET    /api/notebooks/[id] → the notebook and every source in it
 * PATCH  /api/notebooks/[id] → rename, re-describe, or re-attach to a course
 * DELETE /api/notebooks/[id] → delete the notebook and its sources
 */
import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { z } from "zod";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  courseId: z.string().uuid().nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: notebook, error } = await supabase
    .from("notebooks")
    .select("id, title, description, course_id, created_at, course:courses(name)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[notebooks] Detail failed:", error);
    return NextResponse.json({ error: "Could not load that notebook." }, { status: 500 });
  }
  if (!notebook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Sources are notes scoped to this notebook. Content is deliberately not
  // selected — a listing does not need the full text of every PDF.
  const { data: sources } = await supabase
    .from("notes")
    .select("id, title, source_type, source_url, file_name, file_type, word_count, created_at")
    .eq("notebook_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  return NextResponse.json({
    id: notebook.id,
    title: notebook.title,
    description: notebook.description,
    courseId: notebook.course_id,
    courseName: (notebook.course as { name?: string } | null)?.name ?? null,
    sources: (sources ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      kind: s.source_type,
      url: s.source_url,
      fileName: s.file_name,
      fileType: s.file_type,
      wordCount: s.word_count ?? 0,
      createdAt: s.created_at,
    })),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.courseId !== undefined) patch.course_id = parsed.data.courseId;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("notebooks")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, title, description, course_id")
    .maybeSingle();

  if (error) {
    console.error("[notebooks] Update failed:", error);
    return NextResponse.json({ error: "Could not update that notebook." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: data.id,
    title: data.title,
    description: data.description,
    courseId: data.course_id,
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // notes.notebook_id is ON DELETE CASCADE, so the sources go with it.
  const { error } = await supabase
    .from("notebooks")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[notebooks] Delete failed:", error);
    return NextResponse.json({ error: "Could not delete that notebook." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
