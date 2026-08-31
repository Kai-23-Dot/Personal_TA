import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/backend/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsedId = z.string().uuid().safeParse((await params).id);
  if (!parsedId.success) return NextResponse.json({ error: "Invalid note id." }, { status: 400 });

  const { data: note, error } = await supabase
    .from("notes")
    .select("id, title, content, source_type, source_url, file_name, file_type, word_count, unit_name, topic_tags, is_processed, course_id, created_at, updated_at")
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Failed to load the note." }, { status: 500 });
  if (!note) return NextResponse.json({ error: "Note not found." }, { status: 404 });

  let course: { id: string; name: string; color: string | null } | null = null;
  if (note.course_id) {
    const { data: activeCourse } = await supabase.from("courses").select("id, name, color").eq("id", note.course_id).eq("user_id", user.id).eq("is_active", true).maybeSingle();
    if (!activeCourse) return NextResponse.json({ error: "Note not found." }, { status: 404 });
    course = activeCourse;
  }

  return NextResponse.json({ ...note, course });
}
