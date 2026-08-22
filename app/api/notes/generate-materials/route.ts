/**
 * POST /api/notes/generate-materials
 * Body: { noteId: string, type: "flashcards" | "practice" | "both" }
 *
 * Generates study materials from an existing note using the note's content
 * and the professor's exact terminology.
 * - "flashcards": creates flashcard records in the DB, returns deck ID
 * - "practice": generates a practice session using RAG on this note
 * - "both": does both
 */
import { createClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { generateFlashcardsFromContent } from "@/backend/ai/generateFlashcards";
import { generateQuiz } from "@/backend/ai/generateQuiz";
import { assertWithinLimit } from "@/backend/billing/limits";
import { runWithUsageContext } from "@/backend/billing/usageContext";

export const maxDuration = 60;

const materialRequestSchema = z.object({
  noteId: z.string().uuid(),
  type: z.enum(["flashcards", "practice", "both"]).default("both"),
}).strict();

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tokenCheck = await assertWithinLimit(user.id, "ai_credits");
    if (!tokenCheck.ok) {
      return NextResponse.json(
        { error: tokenCheck.reason, code: "LIMIT_REACHED", feature: tokenCheck.feature, limit: tokenCheck.limit, used: tokenCheck.used },
        { status: 402 }
      );
    }

    const parsed = materialRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid note and material type are required." }, { status: 400 });
    }
    const { noteId, type } = parsed.data;
    if (type === "practice" || type === "both") {
      const practiceCheck = await assertWithinLimit(user.id, "practice_test");
      if (!practiceCheck.ok) {
        return NextResponse.json(
          {
            error: practiceCheck.reason,
            code: "LIMIT_REACHED",
            feature: practiceCheck.feature,
            limit: practiceCheck.limit,
            used: practiceCheck.used,
          },
          { status: 402 }
        );
      }
    }

    const { data: note } = await supabase
      .from("notes")
      .select("id, title, content, course_id, course:courses!inner(name,is_active)")
      .eq("id", noteId)
      .eq("user_id", user.id)
      .eq("course.is_active", true)
      .single();

    if (!note?.content) {
      return NextResponse.json({ error: "Note not found or has no content" }, { status: 404 });
    }

    const courseRelation = note.course as { name?: string } | { name?: string }[] | null;
    const courseName = Array.isArray(courseRelation)
      ? courseRelation[0]?.name
      : courseRelation?.name;
    const results: Record<string, unknown> = {};
    const failures: string[] = [];

    if (type === "flashcards" || type === "both") {
      try {
        const cards = await runWithUsageContext(user.id, () =>
          generateFlashcardsFromContent(
            note.content,
            note.title,
            12,
            courseName,
            "mixed"
          )
        );
        const { data: inserted, error: flashcardError } = await supabase
          .from("flashcards")
          .insert(
            cards.map((card) => ({
              user_id: user.id,
              course_id: note.course_id ?? null,
              note_id: note.id,
              front: card.front,
              back: card.back,
              hint: card.hint,
              topic: card.topic || note.title,
              difficulty: card.difficulty,
            }))
          )
          .select("id");
        if (flashcardError) throw flashcardError;
        results.flashcardsCreated = inserted?.length ?? 0;
        results.flashcardIds = (inserted ?? []).map((flashcard) => flashcard.id);
      } catch (error) {
        console.error("[notes/generate-materials] Flashcards failed:", error);
        failures.push("flashcards");
      }
    }

    if (type === "practice" || type === "both") {
      try {
      const questions = await runWithUsageContext(user.id, () =>
        generateQuiz({
          topic: note.title,
          difficulty: "medium",
          questionCount: 8,
          courseName,
          courseNotes: `[Source 0: ${note.title}]\n${note.content.slice(0, 14_000)}`,
          sources: [{ idx: 0, title: note.title }],
        })
      );
        const { data: session, error: sessionError } = await supabase
          .from("practice_sessions")
          .insert({
            user_id: user.id,
            course_id: note.course_id ?? null,
            topic: note.title,
            difficulty: "medium",
            questions,
            question_count: questions.length,
            status: "in_progress",
          })
          .select("id")
          .single();
        if (sessionError) throw sessionError;
        results.sessionId = session.id;
        results.questionCount = questions.length;
      } catch (error) {
        console.error("[notes/generate-materials] Practice failed:", error);
        failures.push("practice");
      }
    }

    return NextResponse.json({
      success: failures.length === 0,
      partial: failures.length > 0 && Object.keys(results).length > 0,
      noteId,
      failures,
      ...results,
    });
  } catch (error) {
    console.error("[notes/generate-materials] Request failed:", error);
    return NextResponse.json(
      { success: false, error: "Could not generate study materials." },
      { status: 500 }
    );
  }
}
