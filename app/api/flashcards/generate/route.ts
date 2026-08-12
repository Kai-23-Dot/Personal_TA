import { createClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import { generateFlashcardsFromContent } from "@/backend/ai/generateFlashcards";
import { canvasDeepFetch } from "@/backend/canvas-intelligence/canvasDeepFetch";
import { assertWithinLimit } from "@/backend/billing/limits";
import { runWithUsageContext } from "@/backend/billing/usageContext";
import { z } from "zod";

export const maxDuration = 60;

const flashcardGenerationSchema = z.object({
  noteId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  topic: z.string().trim().min(1).max(200).optional(),
  count: z.number().int().min(1).max(30).default(10),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
}).strict().superRefine((value, context) => {
  if (!value.noteId && (!value.topic || !value.courseId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide a note, or both a course and topic.",
    });
  }
});

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tokenCheck = await assertWithinLimit(user.id, "tokens");
    if (!tokenCheck.ok) {
      return NextResponse.json(
        { success: false, error: tokenCheck.reason, code: "LIMIT_REACHED", feature: tokenCheck.feature, limit: tokenCheck.limit, used: tokenCheck.used },
        { status: 402 }
      );
    }

    const parsed = flashcardGenerationSchema.safeParse(
      await req.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid flashcard request.",
        },
        { status: 400 }
      );
    }
    let { courseId } = parsed.data;
    const { noteId, topic, count, difficulty } = parsed.data;

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

      if (courseId && note.course_id && courseId !== note.course_id) {
        return NextResponse.json(
          { success: false, error: "The note does not belong to that course." },
          { status: 400 }
        );
      }
      courseId = note.course_id ?? courseId;
      content = note.content;
      courseName = (note as { course?: { name: string } }).course?.name;
      derivedTopic = topic || note.title;
    }

    if (courseId) {
      const { data: course } = await supabase
        .from("courses")
        .select("name")
        .eq("id", courseId)
        .eq("user_id", user.id)
        .single();
      if (!course) {
        return NextResponse.json(
          { success: false, error: "Course not found." },
          { status: 404 }
        );
      }
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
        .eq("course_id", courseId!)
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
    const safeTopic = derivedTopic?.trim();
    if (!safeTopic) {
      return NextResponse.json(
        { success: false, error: "A topic is required to generate flashcards." },
        { status: 400 }
      );
    }

    const generatedCards = await runWithUsageContext(user.id, () =>
      generateFlashcardsFromContent(content, safeTopic, count, courseName, difficulty)
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
          topic: card.topic || safeTopic,
          difficulty: card.difficulty,
        }))
      )
      .select();

    if (error) {
      console.error("[/api/flashcards/generate] Failed to save cards:", error);
      return NextResponse.json(
        { success: false, error: "Could not save the generated flashcards." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: savedCards?.length ?? 0,
      flashcards: savedCards,
    });
  } catch (err) {
    console.error("[/api/flashcards/generate]", err);
    return NextResponse.json(
      { success: false, error: "Could not generate flashcards." },
      { status: 500 }
    );
  }
}
