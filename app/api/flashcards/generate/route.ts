import { createClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import { generateFlashcardsFromContent } from "@/backend/ai/generateFlashcards";
import { canvasDeepFetch } from "@/backend/canvas-intelligence/canvasDeepFetch";
import { assertWithinLimit } from "@/backend/billing/limits";
import { runWithUsageContext } from "@/backend/billing/usageContext";
import { selectBalancedModuleSources } from "@/backend/practice/moduleSources";
import { z } from "zod";

export const maxDuration = 60;

const flashcardUnitSchema = z.object({
  moduleId: z.number().int().positive().nullable(),
  moduleName: z.string().trim().min(1).max(300),
  source: z.enum(["canvas", "generated"]),
  assignmentIds: z.array(z.string().uuid()).max(100),
  noteIds: z.array(z.string().uuid()).max(100),
}).strict();

const flashcardGenerationSchema = z.object({
  noteId: z.string().uuid().optional(),
  noteIds: z.array(z.string().uuid()).max(100).optional(),
  courseId: z.string().uuid().optional(),
  topic: z.string().trim().min(1).max(200).optional(),
  units: z.array(flashcardUnitSchema).min(1).max(12).optional(),
  count: z.number().int().min(1).max(30).default(10),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
}).strict().superRefine((value, context) => {
  const hasSelectedContent = Boolean(
    value.noteId || value.noteIds?.length || value.units?.length
  );
  if (!hasSelectedContent && (!value.topic || !value.courseId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide a note, or both a course and topic.",
    });
  }
  if ((value.noteIds?.length || value.units?.length) && !value.courseId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A course is required for selected notes or units.",
    });
  }
});

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tokenCheck = await assertWithinLimit(user.id, "ai_credits");
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
    const { noteId, noteIds, topic, units = [], count, difficulty } = parsed.data;

    let content = "";
    let courseName: string | undefined;
    let derivedTopic = topic;
    const contentBlocks: Array<{ text: string; moduleName?: string }> = [];

    if (noteId) {
      const { data: note } = await supabase
        .from("notes")
        .select("*, course:courses!inner(name,is_active)")
        .eq("id", noteId)
        .eq("user_id", user.id)
        .eq("course.is_active", true)
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
      contentBlocks.push({ text: `## ${note.title}\n${note.content}` });
      courseName = (note as { course?: { name: string } }).course?.name;
      derivedTopic = topic || note.title;
    }

    if (courseId) {
      const { data: course } = await supabase
        .from("courses")
        .select("name")
        .eq("id", courseId)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single();
      if (!course) {
        return NextResponse.json(
          { success: false, error: "Course not found." },
          { status: 404 }
        );
      }
      courseName = course?.name;
    }

    const selectedUnitNames = units.map((unit) => unit.moduleName);
    derivedTopic = derivedTopic || selectedUnitNames.join(", ").slice(0, 200);
    const selectedUnitChars = selectedUnitNames.length > 1
      ? Math.max(900, Math.floor(18_000 / selectedUnitNames.length))
      : 4_000;
    const selectedCanvasUnits = units.filter((unit) => unit.source === "canvas");
    const noteUnitNames = new Map<string, string>();
    const assignmentUnitNames = new Map<string, string>();
    for (const unit of units) {
      for (const id of unit.noteIds) {
        if (!noteUnitNames.has(id)) noteUnitNames.set(id, unit.moduleName);
      }
      for (const id of unit.assignmentIds) {
        if (!assignmentUnitNames.has(id)) assignmentUnitNames.set(id, unit.moduleName);
      }
    }

    const requestedNoteIds = [
      ...new Set([
        ...(noteIds ?? []),
        ...units.flatMap((unit) => unit.noteIds),
      ]),
    ].slice(0, 120);
    if (courseId && requestedNoteIds.length > 0) {
      const { data: selectedNotes, error: selectedNotesError } = await supabase
        .from("notes")
        .select("id, title, content")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .in("id", requestedNoteIds)
        .not("content", "is", null);
      if (selectedNotesError) {
        throw new Error("Failed to load selected course notes.");
      }
      for (const note of selectedNotes ?? []) {
        const unitName = noteUnitNames.get(note.id);
        contentBlocks.push({
          moduleName: unitName,
          text: `## ${note.title}${unitName ? ` (${unitName})` : ""}\n${String(note.content).slice(0, unitName ? selectedUnitChars : 4_000)}`,
        });
      }
    }

    const requestedAssignmentIds = [
      ...new Set(units.flatMap((unit) => unit.assignmentIds)),
    ].slice(0, 120);
    if (courseId && requestedAssignmentIds.length > 0) {
      const { data: assignments, error: assignmentsError } = await supabase
        .from("assignments")
        .select("id, title, description")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .in("id", requestedAssignmentIds);
      if (assignmentsError) {
        throw new Error("Failed to load selected unit assignments.");
      }
      for (const assignment of assignments ?? []) {
        const description = assignment.description?.trim();
        if (!description) continue;
        const unitName = assignmentUnitNames.get(assignment.id);
        contentBlocks.push({
          moduleName: unitName,
          text: `## ${assignment.title}${unitName ? ` (${unitName})` : ""}\n${description.slice(0, Math.min(1_800, selectedUnitChars))}`,
        });
      }
    }

    // Pull Canvas sources for every selected Canvas unit. For legacy requests
    // without explicit content, retain topic-based whole-course retrieval.
    if (topic && courseId && (selectedCanvasUnits.length > 0 || contentBlocks.length === 0)) {
      const retrieval = await canvasDeepFetch({
        userId: user.id,
        courseId,
        topic,
        moduleIds: selectedCanvasUnits
          .map((unit) => unit.moduleId)
          .filter((id): id is number => id !== null),
        moduleNames: selectedCanvasUnits.map((unit) => unit.moduleName),
        limit: Math.min(24, Math.max(10, selectedCanvasUnits.length * 4)),
      });

      if (retrieval.ranked.length > 0) {
        // Explicit module membership is already a strong relevance signal.
        // Confidence only gates older, unscoped topic searches.
        const sources = selectedCanvasUnits.length > 0
          ? retrieval.ranked
          : retrieval.hasDirectContent
          ? retrieval.ranked.filter((r) => r.confidence >= 0.3)
          : retrieval.ranked;
        const balancedSources = selectBalancedModuleSources(
          sources,
          selectedCanvasUnits.map((unit) => unit.moduleName),
          Math.min(16, Math.max(8, selectedCanvasUnits.length * 3))
        );
        for (const source of balancedSources) {
          contentBlocks.push({
            moduleName: source.chunk.moduleName ?? undefined,
            text: `## ${source.chunk.title}${source.chunk.moduleName ? ` (${source.chunk.moduleName})` : ""}\n${source.chunk.text.slice(0, Math.min(3_000, selectedUnitChars))}`,
          });
        }
      }
    }

    const orderedContent = selectBalancedModuleSources(
      contentBlocks.map((block) => ({
        chunk: { moduleName: block.moduleName },
        block,
      })),
      selectedUnitNames,
      contentBlocks.length
    );
    content = orderedContent
      .map(({ block }) => block.text)
      .join("\n\n---\n\n")
      .slice(0, 80_000);

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
