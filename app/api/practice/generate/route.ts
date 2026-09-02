import { createClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import { generateQuiz, QuizGroundingError } from "@/backend/ai/generateQuiz";
import type { QuizSource } from "@/backend/ai/generateQuiz";
import { canvasDeepFetch } from "@/backend/canvas-intelligence/canvasDeepFetch";
import { v4 as uuidv4 } from "uuid";
import type { Difficulty } from "@/types";
import {
  assertWithinLimits,
  UsageLimitError,
} from "@/backend/billing/limits";
import { runWithUsageContext } from "@/backend/billing/usageContext";
import { selectBalancedModuleSources } from "@/backend/practice/moduleSources";
import {
  assessInstructionalContent,
  hasEnoughInstructionalCoverage,
} from "@/backend/practice/sourceGrounding";
import { z } from "zod";

export const maxDuration = 60;
const lowTokenMode = process.env.LOW_TOKEN_TEST_MODE === "true";
const practiceUnitSchema = z.object({
  moduleId: z.number().int().positive().nullable(),
  moduleName: z.string().trim().min(1).max(300),
  source: z.enum(["canvas", "generated"]),
  assignmentIds: z.array(z.string().uuid()).max(100),
  noteIds: z.array(z.string().uuid()).max(100),
  moduleItemIds: z.array(z.number().int().positive()).max(500).optional().default([]),
  pageSlugs: z.array(z.string().trim().min(1).max(512)).max(50).optional().default([]),
}).strict();
const generatePracticeSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  courseId: z.string().uuid(),
  moduleId: z.number().int().positive().optional(),
  moduleName: z.string().trim().min(1).max(300).optional(),
  moduleSource: z.enum(["canvas", "generated"]).default("canvas"),
  unitAssignmentIds: z.array(z.string().uuid()).max(100).optional(),
  unitNoteIds: z.array(z.string().uuid()).max(100).optional(),
  units: z.array(practiceUnitSchema).min(1).max(12).optional(),
  difficulty: z.enum(["easy", "medium", "hard", "adaptive"]).default("adaptive"),
  questionCount: z.number().int().min(1).max(20).default(5),
  mode: z.enum(["quiz", "mixed"]).default("quiz"),
  noteIds: z.array(z.string().uuid()).max(30).optional(),
  pdfContext: z.string().trim().max(20_000).optional(),
  assignmentId: z.string().uuid().nullable().optional(),
}).strict();

const submitPracticeSchema = z.object({
  sessionId: z.string().uuid(),
  durationSeconds: z.number().int().min(0).max(86_400).nullable().optional(),
  attempts: z.array(z.object({
    question_index: z.number().int().min(0).max(99),
    user_answer: z.string().max(10_000),
    time_taken_seconds: z.number().int().min(0).max(86_400).default(0),
  }).strict()).min(1).max(50),
}).strict();

/**
 * Infers the required programming language from a course name.
 * Returns undefined for non-programming courses or multi-language courses.
 */
function detectCourseLanguage(courseName: string): string | undefined {
  const n = courseName;
  // AP Computer Science A is definitively Java per the College Board curriculum
  if (/AP\s+Computer\s+Science\s+A\b|AP\s+CS\s+A\b|APCS-?A\b/i.test(n)) return "Java";
  // AP Computer Science Principles allows any language — don't enforce
  if (/Computer\s+Science\s+Principles|AP\s+CSP\b/i.test(n)) return undefined;
  // Explicit language mentions in course name
  if (/\bjava\b/i.test(n) && !/javascript/i.test(n)) return "Java";
  if (/\bpython\b/i.test(n)) return "Python";
  if (/\bc\+\+\b|cplusplus\b/i.test(n)) return "C++";
  if (/\bjavascript\b|\bjs\b/i.test(n)) return "JavaScript";
  if (/\bc#\b|csharp\b/i.test(n)) return "C#";
  return undefined;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    // Plan limits: block Free users who've hit the weekly test cap or daily token cap.
    const limitCheck = await assertWithinLimits(user.id, [
      "practice_test",
      "ai_credits",
    ]);
    if (!limitCheck.ok) {
      return NextResponse.json(
        { success: false, error: limitCheck.reason, code: "LIMIT_REACHED", feature: limitCheck.feature, limit: limitCheck.limit, used: limitCheck.used },
        { status: 402 }
      );
    }

    const parsedBody = generatePracticeSchema.safeParse(
      await req.json().catch(() => null)
    );
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, error: "Invalid practice test request." },
        { status: 400 }
      );
    }
    const {
      topic,
      courseId,
      moduleId,
      moduleName,
      moduleSource,
      unitAssignmentIds,
      unitNoteIds,
      units,
      difficulty,
      questionCount,
      noteIds,
      pdfContext,
      assignmentId,
    } = parsedBody.data;

    // Fetch course name (needed for AP detection and language detection)
    const quizSources: QuizSource[] = [];
    let canvasVisionCandidates = 0;
    let canvasVisionExtractions = 0;
    const addSource = (
      title: string,
      content: string,
      metadata: Pick<
        QuizSource,
        "moduleName" | "sourceUrl" | "sourceType" | "visionExtracted"
      > = {}
    ) => {
      const normalizedContent = content.trim();
      if (!normalizedContent) return;
      const idx = quizSources.length;
      quizSources.push({ idx, title, content: normalizedContent, ...metadata });
    };

    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("name")
      .eq("id", courseId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();
    if (courseError || !course) {
      return NextResponse.json(
        { success: false, error: "Course not found." },
        { status: 404 }
      );
    }
    const courseName = course.name;
    const isAP = /^AP\s|^Advanced Placement\s|\bAP\b/i.test(courseName ?? "");
    const courseLanguage = detectCourseLanguage(courseName ?? "");

    // CS courses need more chars per note to preserve full code examples
    const charsPerNote = lowTokenMode
      ? 900
      : courseLanguage
      ? 4000
      : isAP
      ? 2500
      : 3500;

    const selectedUnits = units ?? (
      moduleId || moduleName || unitAssignmentIds?.length || unitNoteIds?.length
        ? [{
            moduleId: moduleId ?? null,
            moduleName: moduleName ?? "Selected unit",
            source: moduleSource,
            assignmentIds: unitAssignmentIds ?? [],
            noteIds: unitNoteIds ?? [],
            moduleItemIds: [],
            pageSlugs: [],
          }]
        : []
    );
    const selectedUnitNames = selectedUnits.map((unit) => unit.moduleName);
    const selectedUnitChars = selectedUnitNames.length > 1
      ? lowTokenMode
        ? Math.max(350, Math.floor(4_200 / selectedUnitNames.length))
        : Math.max(800, Math.floor(12_000 / selectedUnitNames.length))
      : charsPerNote;
    const selectedCanvasUnits = selectedUnits.filter(
      (unit) => unit.source === "canvas"
    );
    const assignmentUnitName = new Map<string, string>();
    for (const unit of selectedUnits) {
      for (const id of unit.assignmentIds) {
        if (!assignmentUnitName.has(id)) {
          assignmentUnitName.set(id, unit.moduleName);
        }
      }
    }

    const requestedNoteIds = [
      ...new Set([
        ...(noteIds ?? []),
        ...(unitNoteIds ?? []),
        ...selectedUnits.flatMap((unit) => unit.noteIds),
      ]),
    ];
    if (requestedNoteIds.length > 0) {
      // Use client-selected specific notes (overrides auto-fetch)
      const { data: selectedNotes, error: notesError } = await supabase
        .from("notes")
        .select("id, title, content, source_file_id")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .in("id", requestedNoteIds)
        .not("content", "is", null);
      if (notesError) {
        throw new Error("Failed to load selected course notes.");
      }
      for (const note of selectedNotes ?? []) {
        const noteUnit = selectedUnits.find((unit) => unit.noteIds.includes(note.id));
        const sourceType = note.source_file_id?.startsWith("canvas_page_")
          ? "canvas_page"
          : note.source_file_id?.startsWith("canvas_file_")
            ? "canvas_file"
            : "file";
        addSource(
          note.title,
          (note.content as string).slice(0, noteUnit ? selectedUnitChars : charsPerNote),
          { moduleName: noteUnit?.moduleName, sourceType }
        );
      }
    }

    const requestedAssignmentIds = [
      ...new Set([
        ...(unitAssignmentIds ?? []),
        ...selectedUnits.flatMap((unit) => unit.assignmentIds),
      ]),
    ];
    if (requestedAssignmentIds.length > 0) {
      const { data: unitAssignments, error: unitAssignmentsError } = await supabase
        .from("assignments")
        .select("id, title, description")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .in("id", requestedAssignmentIds);
      if (unitAssignmentsError) {
        throw new Error("Failed to load the selected unit's assignments.");
      }
      for (const assignment of unitAssignments ?? []) {
        const description = assignment.description?.trim();
        if (!description) continue;
        addSource(
          `Unit Assignment: ${assignment.title}`,
          description.slice(
            0,
            Math.min(selectedUnitChars, lowTokenMode ? 500 : 1600)
          ),
          {
            moduleName: assignmentUnitName.get(assignment.id) ?? moduleName,
            sourceType: "assignment",
          }
        );
      }
    }

    const shouldRetrieveCanvas =
      selectedCanvasUnits.length > 0 || quizSources.length === 0;
    if (shouldRetrieveCanvas) {
      const retrieval = await runWithUsageContext(user.id, () => canvasDeepFetch({
        userId: user.id,
        courseId,
        topic,
        moduleIds: selectedCanvasUnits
          .map((unit) => unit.moduleId)
          .filter((id): id is number => id !== null),
        moduleNames: selectedCanvasUnits.map((unit) => unit.moduleName),
        unitScopes: selectedCanvasUnits.flatMap((unit) =>
          (unit.moduleId !== null && unit.moduleItemIds.length > 0) || unit.pageSlugs.length > 0
            ? [{
                moduleId: unit.moduleId,
                unitName: unit.moduleName,
                moduleItemIds: unit.moduleItemIds,
                pageSlugs: unit.pageSlugs,
              }]
            : []
        ),
        limit: lowTokenMode
          ? 8
          : Math.min(24, Math.max(12, selectedCanvasUnits.length * 4)),
      }));
      canvasVisionCandidates += retrieval.diagnostics.visionCandidates;
      canvasVisionExtractions += retrieval.diagnostics.visionExtractions;

      const availableModuleNames = new Set(
        retrieval.moduleNames.map((name) => name.trim().toLowerCase())
      );
      const missingCanvasUnit = selectedCanvasUnits.find(
        (unit) =>
          !availableModuleNames.has(unit.moduleName.trim().toLowerCase())
      );
      if (missingCanvasUnit) {
        return NextResponse.json(
          {
            success: false,
            error: `${missingCanvasUnit.moduleName} is no longer available in Canvas. Refresh the course units and select again.`,
          },
          { status: 400 }
        );
      }

      // Use content with sufficient confidence for direct question generation
      const selectedCanvasNameKeys = new Set(
        selectedCanvasUnits.map((unit) => unit.moduleName.trim().toLowerCase())
      );
      const moduleSources = selectedCanvasNameKeys.size > 0
        ? retrieval.ranked.filter((result) =>
            selectedCanvasNameKeys.has(
              result.chunk.moduleName?.trim().toLowerCase() ?? ""
            )
          )
        : retrieval.ranked;
      // A user-selected Canvas module is already an exact structural match;
      // semantic confidence should only gate unscoped topic searches.
      const directSources = selectedCanvasNameKeys.size > 0
        ? moduleSources
        : moduleSources.filter((r) => r.confidence >= 0.3);
      if (directSources.length > 0) {
        const capped = selectBalancedModuleSources(
          directSources,
          selectedCanvasUnits.map((unit) => unit.moduleName),
          lowTokenMode
            ? 8
            : Math.min(24, Math.max(12, selectedCanvasUnits.length * 4))
        );
        for (const result of capped) {
          addSource(
            result.chunk.title,
            result.chunk.text.slice(0, selectedUnitChars),
            {
              moduleName: result.chunk.moduleName,
              sourceUrl: result.chunk.sourceUrl,
              sourceType: result.chunk.sourceType,
              visionExtracted: result.chunk.metadata?.visionExtracted === true,
            }
          );
        }
      }
    }

    if (assignmentId) {
      const { data: assignment, error: assignmentError } = await supabase
        .from("assignments")
        .select("title, description")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .eq("id", assignmentId)
        .single();
      if (assignmentError) {
        return NextResponse.json(
          { success: false, error: "Selected assignment was not found in this course." },
          { status: 400 }
        );
      }
      if (assignment?.description) {
        addSource(
          `Selected Assignment: ${assignment.title}`,
          assignment.description.slice(0, lowTokenMode ? 500 : 1200),
          { sourceType: "assignment" }
        );
      }
    }

    // Append or use uploaded PDF/DOCX context
    if (pdfContext) {
      addSource(
        "Uploaded Material",
        pdfContext.slice(0, lowTokenMode ? 1800 : 6000),
        { sourceType: "pdf" }
      );
    }
    const assessedSources = quizSources.map((source) => ({
      source,
      assessment: assessInstructionalContent(source.content, {
        title: source.title,
        moduleName: source.moduleName,
        sourceType: source.sourceType,
        visionExtracted: source.visionExtracted,
      }),
    }));
    const instructionalSources = assessedSources.filter(
      ({ assessment }) => assessment.usable
    );
    const balancedSources = selectBalancedModuleSources(
      instructionalSources.map(({ source, assessment }) => ({
        chunk: { moduleName: source.moduleName },
        source,
        assessment,
      })),
      selectedUnitNames,
      Math.min(
        instructionalSources.length,
        Math.max(selectedUnitNames.length, lowTokenMode ? 6 : 12)
      )
    );
    const materialBudget = lowTokenMode ? 4_000 : 11_500;
    const perSourceBudget = Math.max(
      350,
      Math.floor(materialBudget / Math.max(1, balancedSources.length))
    );
    const orderedSources = balancedSources.map(({ chunk, source }) => {
      const boundedSource = {
        ...source,
        content: (source.content ?? "").slice(0, perSourceBudget).trim(),
      };
      return {
        chunk,
        source: boundedSource,
        assessment: assessInstructionalContent(boundedSource.content, {
          title: boundedSource.title,
          moduleName: boundedSource.moduleName,
          sourceType: boundedSource.sourceType,
          visionExtracted: boundedSource.visionExtracted,
        }),
      };
    }).filter(({ assessment }) => assessment.usable);
    quizSources.splice(
      0,
      quizSources.length,
      ...orderedSources.map(({ source }, index) => ({ ...source, idx: index }))
    );
    const courseNotes = orderedSources.length > 0
      ? orderedSources
          .map(({ source }, index) =>
            `### [${index}] ${source.title}${source.moduleName ? ` (${source.moduleName})` : ""}\n${source.content}`
          )
          .join("\n\n---\n\n")
      : undefined;
    const hasEnoughCoverage = hasEnoughInstructionalCoverage(
      orderedSources.map(({ assessment }) => assessment),
      Math.min(questionCount, lowTokenMode ? 12 : 20)
    );

    // Fetch recent weak topics for adaptive targeting
    const { data: metrics } = await supabase
      .from("performance_metrics")
      .select("topic, subtopic")
      .eq("user_id", user.id)
      .lt("accuracy_pct", 60)
      .order("accuracy_pct", { ascending: true })
      .limit(5);

    const recentMistakes = (metrics ?? []).map((m) => m.subtopic ?? m.topic);

    // Adaptive difficulty tuning based on recent performance
    let effectiveDifficulty: Difficulty = difficulty;
    if (difficulty === "adaptive") {
      const { data: attempts } = await supabase
        .from("quiz_attempts")
        .select("is_correct")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .eq("topic", topic)
        .order("created_at", { ascending: false })
        .limit(30);

      if (attempts && attempts.length > 0) {
        const correct = attempts.filter((a) => a.is_correct).length;
        const accuracy = correct / attempts.length;
        if (accuracy < 0.6) effectiveDifficulty = "easy";
        else if (accuracy < 0.85) effectiveDifficulty = "medium";
        else effectiveDifficulty = "hard";
      }
    }

    // If we still have no course context, block generation to avoid off-topic content
    if (!courseNotes || !hasEnoughCoverage) {
      const selectedUnitError = canvasVisionCandidates > 0 && canvasVisionExtractions === 0
        ? "Smartlearn found images or scanned files in the selected Canvas unit, but Canvas did not return readable image bytes or vision OCR could not extract them. Confirm the files are published and visible to students, then try again."
        : canvasVisionExtractions > 0
          ? "Smartlearn read some Canvas images, but the selected unit still does not contain enough instructional detail for the requested number of grounded questions. Select fewer questions or add/publish more unit material."
          : "Smartlearn found the selected unit, but only found titles, links, or navigation—not enough instructional content for a grounded test. Add or publish Canvas notes, homework, images, or files, then try again.";
      return NextResponse.json(
        {
          success: false,
          error: selectedUnitNames.length > 0
            ? selectedUnitError
            : "No Canvas course content found yet. Sync Canvas or upload notes for this course, then try again.",
        },
        { status: 400 }
      );
    }

    // Generate questions (token usage attributed to this user via the context)
    const rawQuestions = await runWithUsageContext(user.id, () =>
      generateQuiz({
        topic,
        difficulty: effectiveDifficulty,
        questionCount: Math.min(questionCount, lowTokenMode ? 12 : 20),
        courseNotes,
        isAP,
        recentMistakes,
        courseName,
        courseLanguage,
        lowTokenMode,
        sources: quizSources.length > 0 ? quizSources : undefined,
      })
    );

    // Attach citation metadata to each question using source_idx
    const questions = rawQuestions.map((q) => {
      const sourceIndex = (q as typeof q & { source_idx?: number }).source_idx;
      if (typeof sourceIndex === "number" && quizSources[sourceIndex]) {
        const src = quizSources[sourceIndex];
        return { ...q, source_title: src.title, source_module: src.moduleName ?? null, source_url: src.sourceUrl ?? null };
      }
      return q;
    });

    if (questions.length === 0) {
      return NextResponse.json({ success: false, error: "Failed to generate questions" }, { status: 500 });
    }

    // Create practice session record
    const sessionId = uuidv4();
    const { error: sessionError } = await supabase.from("practice_sessions").insert({
      id: sessionId,
      user_id: user.id,
      course_id: courseId ?? null,
      topic,
      difficulty: effectiveDifficulty,
      question_count: questions.length,
      questions,
      status: "in_progress",
    });

    if (sessionError) {
      console.error("[practice/generate] Session insert error:", sessionError);
      return NextResponse.json(
        { success: false, error: "Failed to save the generated practice session." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, sessionId, questions });
  } catch (err) {
    console.error("[/api/practice/generate] Error:", err);
    // The atomic reservation can reject a concurrent request even when the
    // earlier snapshot check passed. Preserve the actionable upgrade response
    // instead of turning that valid limit result into a generic 500.
    if (err instanceof UsageLimitError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: 402 }
      );
    }
    if (err instanceof QuizGroundingError) {
      return NextResponse.json(
        {
          success: false,
          error: `Smartlearn could verify only ${err.acceptedQuestions} of ${err.requestedQuestions} generated questions against the selected Canvas material. No unverified questions were saved. Try fewer questions or add more readable unit content.`,
          code: "INSUFFICIENT_GROUNDED_QUESTIONS",
        },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Practice test generation failed. Please try again." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  // Update session with results
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const parsedBody = submitPracticeSchema.safeParse(
      await req.json().catch(() => null)
    );
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, error: "Invalid practice submission." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("submit_practice_session", {
      submit_user_id: user.id,
      submit_session_id: parsedBody.data.sessionId,
      submitted_attempts: parsedBody.data.attempts,
      submitted_duration_seconds: parsedBody.data.durationSeconds ?? null,
    });
    if (error) {
      console.error("[practice/generate] Submission failed:", error);
      return NextResponse.json(
        { success: false, error: "Failed to save practice results." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, result: data });
  } catch (err) {
    console.error("[practice/generate] Submission error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to save practice results." },
      { status: 500 }
    );
  }
}
