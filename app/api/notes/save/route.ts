import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, content, courseId, unitName, examName, topicTags } = body as {
    title: string;
    content: string;
    courseId?: string | null;
    unitName?: string | null;
    examName?: string | null;
    topicTags?: string[] | null;
  };

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "title and content are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      course_id: courseId ?? null,
      title: title.trim(),
      content: content.trim(),
      source_type: "manual",
      unit_name: unitName?.trim() || null,
      exam_name: examName?.trim() || null,
      topic_tags: topicTags ?? [],
      is_processed: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, noteId: data.id });
}
