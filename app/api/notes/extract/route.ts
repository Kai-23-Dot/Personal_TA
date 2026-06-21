import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { extractNoteDetails } from "@/backend/ai/extractNoteDetails";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { noteId } = await req.json();
    if (!noteId) return NextResponse.json({ success: false, error: "noteId is required" }, { status: 400 });

    const { data: note, error: noteError } = await supabase
      .from("notes")
      .select("id, content")
      .eq("id", noteId)
      .eq("user_id", user.id)
      .single();

    if (noteError || !note?.content) {
      return NextResponse.json({ success: false, error: "Note not found or empty" }, { status: 404 });
    }

    const extracted = await extractNoteDetails(note.content);

    const { data, error } = await supabase
      .from("note_extractions")
      .upsert(
        {
          user_id: user.id,
          note_id: noteId,
          key_concepts: extracted.key_concepts,
          formulas: extracted.formulas,
          definitions: extracted.definitions,
          examples: extracted.examples,
        },
        { onConflict: "user_id,note_id" }
      )
      .select()
      .single();

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, extraction: data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
