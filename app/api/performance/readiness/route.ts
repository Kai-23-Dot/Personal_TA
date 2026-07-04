/**
 * GET /api/performance/readiness?assignmentId=<id>
 * Returns exam readiness prediction based on:
 * - Practice accuracy for topics related to this course
 * - Time remaining vs estimated study time
 * - Weak topic count
 */
import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const assignmentId = searchParams.get("assignmentId");

  if (!assignmentId) {
    return NextResponse.json({ error: "assignmentId is required" }, { status: 400 });
  }

  // Load the assignment
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, title, assignment_type, due_date, course_id, weight, points_possible, estimated_minutes")
    .eq("id", assignmentId)
    .eq("user_id", user.id)
    .single();

  if (!assignment) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });

  const courseId = assignment.course_id;

  // Practice sessions for this course (last 30 days)
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: sessions } = await supabase
    .from("practice_sessions")
    .select("score, total_questions, created_at")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);

  // Weak topics for this course
  const { data: weakTopics } = await supabase
    .from("weak_topics")
    .select("topic, accuracy_pct")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .lt("accuracy_pct", 70)
    .order("accuracy_pct", { ascending: true })
    .limit(5);

  // Flashcard due count (overdue SM-2 cards for this course)
  const { count: dueCards } = await supabase
    .from("flashcards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .lte("next_review", new Date().toISOString());

  // ── Score computation ──────────────────────────────────────────────────────

  const daysLeft = assignment.due_date
    ? (new Date(assignment.due_date).getTime() - Date.now()) / 86_400_000
    : 3;

  // 1. Practice accuracy component (40pts)
  let accuracyScore = 20; // default mid
  if ((sessions ?? []).length > 0) {
    const totalCorrect = sessions!.reduce((s, p) => s + (p.score ?? 0), 0);
    const totalQ = sessions!.reduce((s, p) => s + (p.total_questions ?? 1), 0);
    const avgAccuracy = totalQ > 0 ? (totalCorrect / totalQ) * 100 : 50;
    accuracyScore = Math.round((avgAccuracy / 100) * 40);
  }

  // 2. Time preparation component (30pts)
  const estimatedHours = (assignment.estimated_minutes ?? 90) / 60;
  const availableHours = Math.max(0, daysLeft) * 2; // 2h/day productive
  const prepRatio = availableHours > 0 ? Math.min(1, availableHours / estimatedHours) : 0;
  const timeScore = Math.round(prepRatio * 30);

  // 3. Weak topics penalty (20pts max — fewer weak topics = higher score)
  const weakCount = (weakTopics ?? []).length;
  const weakScore = Math.round(Math.max(0, 20 - weakCount * 5));

  // 4. Flashcard readiness (10pts)
  const flashScore = dueCards === 0 ? 10 : Math.max(0, 10 - Math.min(10, dueCards ?? 0));

  const total = Math.min(100, accuracyScore + timeScore + weakScore + flashScore);

  const label =
    total >= 80 ? "Well prepared" :
    total >= 60 ? "On track" :
    total >= 40 ? "Needs attention" :
    "Behind — start now";

  const confidence =
    (sessions ?? []).length >= 3 ? "high" :
    (sessions ?? []).length >= 1 ? "medium" : "low";

  return NextResponse.json({
    assignmentId,
    title: assignment.title,
    dueDate: assignment.due_date,
    daysLeft: Math.ceil(daysLeft),
    score: total,
    label,
    confidence,
    breakdown: { accuracyScore, timeScore, weakScore, flashScore },
    weakTopics: (weakTopics ?? []).map((t) => ({ topic: t.topic, accuracy: t.accuracy_pct })),
    recentSessions: (sessions ?? []).length,
    dueFlashcards: dueCards ?? 0,
  });
}
