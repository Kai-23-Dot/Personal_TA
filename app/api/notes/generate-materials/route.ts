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
import { generateText } from "ai";
import { chatModel } from "@/backend/ai/provider";
import { assertWithinLimit } from "@/backend/billing/limits";
import { runWithUsageContext } from "@/backend/billing/usageContext";

export const maxDuration = 60;

interface GeneratedFlashcard {
  front: string;
  back: string;
  tags?: string[];
}

async function generateFlashcardsFromNote(
  content: string,
  title: string,
  courseId: string | null
): Promise<GeneratedFlashcard[]> {
  const truncated = content.slice(0, 6000);
  const prompt = `You are creating high-quality study flashcards from a student's notes.

Note title: "${title}"
Note content:
${truncated}

Create 12-15 flashcards that cover the most important concepts, definitions, formulas, and facts.
Use the exact terminology from the notes (don't paraphrase professor vocabulary).
Format: Return ONLY valid JSON:
{
  "flashcards": [
    { "front": "What is ...?", "back": "...", "tags": ["keyword1", "keyword2"] },
    ...
  ]
}`;

  const { text } = await generateText({ model: chatModel, prompt, maxTokens: 2000 });
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const parsed = JSON.parse(json) as { flashcards: GeneratedFlashcard[] };
  return parsed.flashcards ?? [];
}

async function generatePracticeFromNote(
  content: string,
  title: string
): Promise<{ question: string; options: string[]; answer: string; explanation: string }[]> {
  const truncated = content.slice(0, 6000);
  const prompt = `You are creating a practice quiz from a student's notes.

Note title: "${title}"
Note content:
${truncated}

Generate 8 multiple-choice questions covering the key concepts.
Mirror the style and vocabulary used in the notes (as if the professor wrote it).
Format: Return ONLY valid JSON:
{
  "questions": [
    {
      "question": "...",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "A",
      "explanation": "..."
    }
  ]
}`;

  const { text } = await generateText({ model: chatModel, prompt, maxTokens: 2500 });
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const parsed = JSON.parse(json) as { questions: { question: string; options: string[]; answer: string; explanation: string }[] };
  return parsed.questions ?? [];
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tokenCheck = await assertWithinLimit(user.id, "tokens");
  if (!tokenCheck.ok) {
    return NextResponse.json(
      { error: tokenCheck.reason, code: "LIMIT_REACHED", feature: tokenCheck.feature, limit: tokenCheck.limit, used: tokenCheck.used },
      { status: 402 }
    );
  }

  const { noteId, type = "both" } = await req.json();

  if (!noteId) return NextResponse.json({ error: "noteId is required" }, { status: 400 });

  const { data: note } = await supabase
    .from("notes")
    .select("id, title, content, course_id, topic_tags")
    .eq("id", noteId)
    .eq("user_id", user.id)
    .single();

  if (!note || !note.content) {
    return NextResponse.json({ error: "Note not found or has no content" }, { status: 404 });
  }

  const results: Record<string, unknown> = {};

  if (type === "flashcards" || type === "both") {
    try {
      const cards = await runWithUsageContext(user.id, () =>
        generateFlashcardsFromNote(note.content, note.title, note.course_id)
      );
      if (cards.length > 0) {
        const rows = cards.map((c) => ({
          user_id: user.id,
          course_id: note.course_id ?? null,
          front: c.front,
          back: c.back,
          tags: c.tags ?? note.topic_tags ?? [],
          source_note_id: note.id,
          difficulty: "medium" as const,
          ease_factor: 2.5,
          interval_days: 1,
          repetitions: 0,
          next_review: new Date().toISOString(),
        }));
        const { data: inserted, error: fcError } = await supabase
          .from("flashcards")
          .insert(rows)
          .select("id");
        if (fcError) throw new Error(fcError.message);
        results.flashcardsCreated = inserted?.length ?? 0;
        results.flashcardIds = (inserted ?? []).map((f) => f.id);
      }
    } catch (err) {
      results.flashcardsError = (err as Error).message;
    }
  }

  if (type === "practice" || type === "both") {
    try {
      const questions = await runWithUsageContext(user.id, () =>
        generatePracticeFromNote(note.content, note.title)
      );
      if (questions.length > 0) {
        // Create a practice session pre-seeded with these questions
        const { data: session, error: sessionError } = await supabase
          .from("practice_sessions")
          .insert({
            user_id: user.id,
            course_id: note.course_id ?? null,
            topic: note.title,
            questions,
            total_questions: questions.length,
            source: "note_materials",
          })
          .select("id")
          .single();
        if (sessionError) throw new Error(sessionError.message);
        results.sessionId = session?.id;
        results.questionCount = questions.length;
      }
    } catch (err) {
      results.practiceError = (err as Error).message;
    }
  }

  return NextResponse.json({ success: true, noteId, ...results });
}
