import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateFlashcardsFromContent } from "@/lib/ai/generateFlashcards";
import { canvasDeepFetch } from "@/lib/canvas-intelligence/canvasDeepFetch";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { noteId, courseId, topic, count = 10, difficulty = "mixed" } = await req.json();

    if (!noteId && !topic) {
      return NextResponse.json(
        { success: false, error: "Provide noteId or topic" },
        { status: 400 }
      );
    }

    let content = "";
    let courseName: string | undefined;
    let derivedTopic = topic;

    if (noteId) {
      const { data: note } = await supabase
        .from("notes")
        .select("*, course:courses(name)")
        .eq("id", noteId)
        .eq("user_id", user.id)
        .single();

      if (!note || !note.content) {
        return NextResponse.json({ success: false, error: "Note not found or empty" }, { status: 404 });
      }

      content = note.content;
      courseName = (note as { course?: { name: string } }).course?.name;
      derivedTopic = topic || note.title;
    }

    if (courseId && !courseName) {
      const { data: course } = await supabase
        .from("courses")
        .select("name")
        .eq("id", courseId)
        .single();
      courseName = course?.name;
    }

    // If no note content, use canvasDeepFetch to pull the most relevant course content
    if (!content && topic && courseId) {
      const retrieval = await canvasDeepFetch({
        userId: user.id,
        courseId,
        topic,
        limit: 10,
      });

      if (retrieval.ranked.length > 0) {
        // Use direct content if available, otherwise style-hint content
        const sources = retrieval.hasDirectContent
          ? retrieval.ranked.filter((r) => r.confidence >= 0.3)
          : retrieval.ranked;

        content = sources
          .slice(0, 8)
          .map((r) => `## ${r.chunk.title}\n${r.chunk.text.slice(0, 3000)}`)
          .join("\n\n---\n\n");
      }
    }

    // Final fallback: recent summaries for the topic
    if (!content && topic) {
      const { data: summaries } = await supabase
        .from("note_summaries")
        .select("content")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(3);

      content = (summaries ?? []).map((s) => s.content).join("\n\n");
    }

    if (!content) {
      return NextResponse.json(
        { success: false, error: "No content available to generate flashcards. Sync Canvas or upload notes first." },
        { status: 400 }
      );
    }

    const generatedCards = await generateFlashcardsFromContent(
      content,
      derivedTopic,
      count,
      courseName,
      difficulty
    );

    if (generatedCards.length === 0) {
      return NextResponse.json(
        { success: false, error: "Failed to generate flashcards" },
        { status: 500 }
      );
    }

    // Insert all cards into the database
    const { data: savedCards, error } = await supabase
      .from("flashcards")
      .insert(
        generatedCards.map((card) => ({
          id: card.id,
          user_id: user.id,
          course_id: courseId ?? null,
          note_id: noteId ?? null,
          front: card.front,
          back: card.back,
          hint: card.hint,
          topic: card.topic || derivedTopic,
          difficulty: card.difficulty,
        }))
      )
      .select();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: savedCards?.length ?? 0,
      flashcards: savedCards,
    });
  } catch (err) {
    console.error("[/api/flashcards/generate]", err);
    return NextResponse.json({ success: false, error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
