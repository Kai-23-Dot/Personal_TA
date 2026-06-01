import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateQuiz } from "@/lib/ai/generateQuiz";
import { retrieveRankedSources } from "@/lib/canvas-intelligence/hybridRetriever";
import { v4 as uuidv4 } from "uuid";
import type { Difficulty } from "@/types";

export const maxDuration = 60;

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

    const body = await req.json();
    const { topic, courseId, difficulty = "adaptive", questionCount = 5, noteIds, pdfContext, assignmentId } = body as {
      topic: string;
      courseId: string | null;
      difficulty: Difficulty;
      questionCount?: number;
      noteIds?: string[];
      pdfContext?: string;
      assignmentId?: string | null;
    };

    if (!topic) {
      return NextResponse.json({ success: false, error: "topic is required" }, { status: 400 });
    }
    if (!courseId) {
      return NextResponse.json({ success: false, error: "courseId is required for Canvas-aligned practice tests" }, { status: 400 });
    }

    // Fetch course name (needed for AP detection and language detection)
    let courseName: string | undefined;
    let courseNotes: string | undefined;
    let isAP = false;
    let courseLanguage: string | undefined;
    if (courseId) {
      const { data: course } = await supabase.from("courses").select("name").eq("id", courseId).single();
      courseName = course?.name;
      isAP = /^AP\s|^Advanced Placement\s|\bAP\b/i.test(courseName ?? "");
      courseLanguage = detectCourseLanguage(courseName ?? "");
    }

    // CS courses need more chars per note to preserve full code examples
    const charsPerNote = courseLanguage ? 4000 : isAP ? 2500 : 3500;

    if (noteIds && noteIds.length > 0) {
      // Use client-selected specific notes (overrides auto-fetch)
      const { data: selectedNotes } = await supabase
        .from("notes")
        .select("title, content")
        .eq("user_id", user.id)
        .in("id", noteIds)
        .not("content", "is", null);
      if (selectedNotes && selectedNotes.length > 0) {
        courseNotes = selectedNotes
          .map((n) => `### ${n.title}\n${(n.content as string).slice(0, charsPerNote)}`)
          .join("\n\n---\n\n");
      }
    } else if (courseId) {
      const retrieval = await retrieveRankedSources({
        userId: user.id,
        query: topic,
        courseId,
        topic,
        assignmentId: assignmentId ?? null,
        limit: 12,
      });

      if (retrieval.confidence.shouldAskForClarification || retrieval.ranked.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Low retrieval confidence for this topic. Select sources manually or refine topic.",
            retrieval: {
              confidence: retrieval.confidence,
              candidates: retrieval.ranked.slice(0, 5).map((r) => ({
                title: r.chunk.title,
                sourceUrl: r.chunk.sourceUrl ?? null,
                confidence: r.confidence,
                reason: r.reasons.join("; "),
              })),
            },
          },
          { status: 409 }
        );
      }

      courseNotes = retrieval.ranked
        .filter((r) => r.confidence >= 0.55)
        .map((r) => `### ${r.chunk.title}\n${r.chunk.text.slice(0, charsPerNote)}\n[Source: ${r.chunk.sourceUrl ?? "Canvas"}]\n[Why: ${r.reasons.join(", ")}]`)
        .join("\n\n---\n\n");
    }

    if (assignmentId) {
      const { data: assignment } = await supabase
        .from("assignments")
        .select("title, description")
        .eq("user_id", user.id)
        .eq("id", assignmentId)
        .single();
      if (assignment?.description) {
        const assignmentBlock = `### Selected Assignment\n**${assignment.title}**\n${assignment.description.slice(0, 1200)}`;
        courseNotes = courseNotes ? `${courseNotes}\n\n---\n\n${assignmentBlock}` : assignmentBlock;
      }
    }

    // Append or use uploaded PDF/DOCX context
    if (pdfContext) {
      const pdfSection = `### Uploaded Material\n${pdfContext.slice(0, 6000)}`;
      courseNotes = courseNotes ? `${courseNotes}\n\n---\n\n${pdfSection}` : pdfSection;
    }

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

    // Generate questions
    const questions = await generateQuiz({
      topic,
      difficulty: effectiveDifficulty,
      questionCount: Math.min(Math.max(questionCount, 1), 50),
      courseNotes,
      isAP,
      recentMistakes,
      courseName,
      courseLanguage,
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
    }

    return NextResponse.json({ success: true, sessionId, questions });
  } catch (err) {
    console.error("[/api/practice/generate] Error:", err);
    return NextResponse.json({ success: false, error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  // Update session with results
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { sessionId, correct, total, topic, courseId, durationSeconds, attempts } = await req.json();

    const { error } = await supabase
      .from("practice_sessions")
      .update({
        correct_count: correct,
        status: "completed",
        completed_at: new Date().toISOString(),
        duration_seconds: durationSeconds ?? null,
      })
      .eq("id", sessionId)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Record per-question attempts (best effort)
    if (Array.isArray(attempts) && attempts.length > 0) {
      await supabase.from("quiz_attempts").insert(
        attempts.map((a: { question_index: number; user_answer: string; is_correct: boolean; time_taken_seconds: number }) => ({
          user_id: user.id,
          session_id: sessionId,
          question_index: a.question_index,
          user_answer: a.user_answer,
          is_correct: a.is_correct,
          time_taken_seconds: a.time_taken_seconds ?? 0,
        }))
      );
    }

    // Upsert performance metrics
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const mastery = accuracy >= 85 ? "mastered" : accuracy >= 65 ? "practicing" : "learning";

    await supabase.from("performance_metrics").upsert(
      {
        user_id: user.id,
        course_id: courseId ?? null,
        topic,
        attempts: total,
        correct,
        accuracy_pct: accuracy,
        last_practiced: new Date().toISOString(),
        mastery_level: mastery,
      },
      { onConflict: "user_id,topic" }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
