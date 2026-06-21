import { createClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { front, back, hint, topic, courseId, noteId } = body as {
    front: string;
    back: string;
    hint?: string | null;
    topic?: string | null;
    courseId?: string | null;
    noteId?: string | null;
  };

  if (!front || !back) {
    return NextResponse.json({ error: "front and back are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("flashcards")
    .insert({
      user_id: user.id,
      course_id: courseId ?? null,
      note_id: noteId ?? null,
      front,
      back,
      hint: hint ?? null,
      topic: topic ?? "General",
      difficulty: "medium",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, flashcard: data });
}
