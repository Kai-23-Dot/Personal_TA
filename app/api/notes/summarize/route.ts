import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { summarizeNotes } from "@/lib/ai/summarizeNotes";
import { generateEmbedding } from "@/lib/utils/embeddings";
import type { SummaryType } from "@/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { noteId, summaryType = "bullet_points", customInstruction } = body as {
      noteId: string;
      summaryType: SummaryType;
      customInstruction?: string;
    };

    if (!noteId) {
      return NextResponse.json({ success: false, error: "noteId is required" }, { status: 400 });
    }

    // Fetch note
    const { data: note, error: noteError } = await supabase
      .from("notes")
      .select("*, course:courses(name)")
      .eq("id", noteId)
      .eq("user_id", user.id)
      .single();

    if (noteError || !note) {
      return NextResponse.json({ success: false, error: "Note not found" }, { status: 404 });
    }

    if (!note.content) {
      return NextResponse.json({ success: false, error: "Note has no text content" }, { status: 400 });
    }

    // Generate summary
    const { summary, keyConcepts, tokensUsed } = await summarizeNotes({
      content: note.content,
      title: note.title,
      summaryType,
      customInstruction,
      courseName: (note as { course?: { name: string } }).course?.name,
    });

    // Generate embedding for summary
    let embedding: number[] | null = null;
    try {
      embedding = await generateEmbedding(summary.slice(0, 8000));
    } catch {
      // Non-fatal
    }

    // Save summary
    const { data: savedSummary, error: saveError } = await supabase
      .from("note_summaries")
      .insert({
        user_id: user.id,
        note_id: noteId,
        course_id: note.course_id,
        summary_type: summaryType,
        content: summary,
        key_concepts: keyConcepts,
        custom_instruction: customInstruction ?? null,
        tokens_used: tokensUsed,
        embedding: embedding ? `[${embedding.join(",")}]` : null,
      })
      .select()
      .single();

    if (saveError) {
      return NextResponse.json({ success: false, error: saveError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, summary: savedSummary });
  } catch (err) {
    console.error("[/api/notes/summarize] Error:", err);
    return NextResponse.json({ success: false, error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
