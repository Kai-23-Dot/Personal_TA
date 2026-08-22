import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { extractNoteDetails } from "@/backend/ai/extractNoteDetails";
import { assertWithinLimit, UsageLimitError } from "@/backend/billing/limits";
import { runWithUsageContext } from "@/backend/billing/usageContext";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const creditCheck = await assertWithinLimit(user.id, "ai_credits");
    if (!creditCheck.ok) {
      return NextResponse.json(
        { success: false, error: creditCheck.reason, code: "LIMIT_REACHED" },
        { status: 402 }
      );
    }

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

    const extracted = await runWithUsageContext(user.id, () =>
      extractNoteDetails(note.content)
    );

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
    if (err instanceof UsageLimitError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: 402 }
      );
    }
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
