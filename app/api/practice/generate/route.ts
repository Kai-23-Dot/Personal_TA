import { createClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import { generateQuiz } from "@/backend/ai/generateQuiz";
import type { QuizSource } from "@/backend/ai/generateQuiz";
import { canvasDeepFetch } from "@/backend/canvas-intelligence/canvasDeepFetch";
import { v4 as uuidv4 } from "uuid";
import type { Difficulty } from "@/types";
import { assertWithinLimits } from "@/backend/billing/limits";
import { runWithUsageContext } from "@/backend/billing/usageContext";
import { z } from "zod";

export const maxDuration = 60;
const lowTokenMode = process.env.LOW_TOKEN_TEST_MODE === "true";
const generatePracticeSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  courseId: z.string().uuid(),
  difficulty: z.enum(["easy", "medium", "hard", "adaptive"]).default("adaptive"),
  questionCount: z.number().int().min(1).max(20).default(5),
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
      "tokens",
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
      difficulty,
      questionCount,
      noteIds,
      pdfContext,
      assignmentId,
    } = parsedBody.data;

    // Fetch course name (needed for AP detection and language detection)
    const quizSources: QuizSource[] = [];
    const sourceBlocks: string[] = [];
    const addSource = (
      title: string,
      content: string,
      metadata: Pick<QuizSource, "moduleName" | "sourceUrl"> = {}
    ) => {
      const idx = quizSources.length;
      quizSources.push({ idx, title, ...metadata });
      sourceBlocks.push(
        `### [${idx}] ${title}${metadata.moduleName ? ` (${metadata.moduleName})` : ""}\n${content}`
      );
    };

    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("name")
      .eq("id", courseId)
      .eq("user_id", user.id)
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

    if (noteIds && noteIds.length > 0) {
      // Use client-selected specific notes (overrides auto-fetch)
      const { data: selectedNotes, error: notesError } = await supabase
        .from("notes")
        .select("title, content")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .in("id", noteIds)
        .not("content", "is", null);
      if (notesError) {
        throw new Error("Failed to load selected course notes.");
      }
      for (const note of selectedNotes ?? []) {
        addSource(note.title, (note.content as string).slice(0, charsPerNote));
      }
    } else {
      const retrieval = await canvasDeepFetch({
        userId: user.id,
        courseId,
        topic,
        limit: 12,
      });

      // Use content with sufficient confidence for direct question generation
      const directSources = retrieval.ranked.filter((r) => r.confidence >= 0.3);
      if (directSources.length > 0) {
        const capped = directSources.slice(0, lowTokenMode ? 5 : 12);
        for (const result of capped) {
          addSource(
            result.chunk.title,
            result.chunk.text.slice(0, charsPerNote),
            {
              moduleName: result.chunk.moduleName,
              sourceUrl: result.chunk.sourceUrl,
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
          assignment.description.slice(0, lowTokenMode ? 500 : 1200)
        );
      }
    }

    // Append or use uploaded PDF/DOCX context
    if (pdfContext) {
      addSource(
        "Uploaded Material",
        pdfContext.slice(0, lowTokenMode ? 1800 : 6000)
      );
    }
    const courseNotes = sourceBlocks.join("\n\n---\n\n") || undefined;

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
    if (!courseNotes) {
      return NextResponse.json(
        {
          success: false,
          error: "No Canvas course content found yet. Sync Canvas or upload notes for this course, then try again.",
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
