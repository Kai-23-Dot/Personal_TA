/**
 * GET /api/study/recommendations
 *
 * Returns "what to study next" — topics ranked by the product of:
 *   - grade_impact  (assignment weight / points_possible)
 *   - weakness_score (1 - accuracy_pct, so lower accuracy = higher priority)
 *
 * Falls back to upcoming high-weight assignments when no practice data exists.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";

export type Recommendation = {
  topic: string;
  course_name: string | null;
  course_id: string | null;
  accuracy_pct: number | null;
  priority_score: number;
  due_date: string | null;
  reason: string;
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: activeCourses } = await supabase
    .from("courses")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true);
  const activeCourseIds = (activeCourses ?? []).map((course) => course.id);
  if (activeCourseIds.length === 0) return NextResponse.json([]);

  // Both weakness signals and assignment fallbacks must belong to a current course.
  const [{ data: metrics }, { data: rawAssignments }] = await Promise.all([
    supabase
      .from("performance_metrics")
      .select("topic, course_id, accuracy_pct")
      .eq("user_id", user.id)
      .in("course_id", activeCourseIds)
      .order("accuracy_pct", { ascending: true })
      .limit(20),
    supabase
      .from("assignments")
      .select(`id, title, assignment_type, due_date, weight, points_possible, is_completed, course:courses!inner(id, name, is_active)`)
      .eq("user_id", user.id)
      .eq("course.is_active", true)
      .in("course_id", activeCourseIds)
      .eq("is_completed", false)
      .or(`due_date.is.null,due_date.gte.${new Date().toISOString()}`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(30),
  ]);

  const assignments = ((rawAssignments ?? []) as any[]).map((a) => {
    const c = Array.isArray(a.course) ? a.course[0] : a.course;
    return { ...a, course_name: c?.name ?? null, course_id: c?.id ?? null };
  });

  const recommendations: Recommendation[] = [];
  const seenTopics = new Set<string>();

  // ── 1. Combine practice weakness with upcoming assignments ──
  if (metrics && metrics.length > 0) {
    for (const m of metrics) {
      if (seenTopics.has(m.topic)) continue;
      seenTopics.add(m.topic);

      // Find the nearest upcoming assignment for the same course
      const related = assignments.find((a) => a.course_id === m.course_id);
      const accuracyPct = m.accuracy_pct ?? 50;
      const weaknessScore = (100 - accuracyPct) / 100; // 0-1, higher = weaker
      const gradeImpact = related?.weight ? (related.weight / 100) : 0.3;
      const priorityScore = Math.round(weaknessScore * gradeImpact * 100);

      const reason =
        accuracyPct < 50
          ? `Low accuracy (${accuracyPct}%) — review this topic before it costs you grade points`
          : accuracyPct < 70
          ? `Needs practice (${accuracyPct}%) — a few more sessions will solidify this`
          : `Keep it sharp (${accuracyPct}%) — maintenance practice recommended`;

      // Find course name from assignments or metrics
      const courseName = related?.course_name ?? null;

      recommendations.push({
        topic: m.topic,
        course_name: courseName,
        course_id: m.course_id ?? null,
        accuracy_pct: accuracyPct,
        priority_score: priorityScore,
        due_date: related?.due_date ?? null,
        reason,
      });
    }
  }

  // ── 2. Seed from upcoming high-weight assignments when no practice data ──
  if (recommendations.length < 3) {
    const sorted = [...assignments].sort((a, b) => {
      const wa = a.weight ?? a.points_possible ?? 0;
      const wb = b.weight ?? b.points_possible ?? 0;
      return wb - wa;
    });

    for (const a of sorted.slice(0, 8)) {
      const topicKey = a.title;
      if (seenTopics.has(topicKey)) continue;
      seenTopics.add(topicKey);

      const weight = a.weight ?? (a.points_possible ? Math.min(a.points_possible / 10, 30) : 10);
      const priorityScore = Math.round((weight / 100) * 100);

      recommendations.push({
        topic: a.title,
        course_name: a.course_name,
        course_id: a.course_id,
        accuracy_pct: null,
        priority_score: priorityScore,
        due_date: a.due_date ?? null,
        reason: a.due_date
          ? `Due ${new Date(a.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — practice before you lose points`
          : "High-weight assignment — worth studying before class",
      });
    }
  }

  // Sort by priority descending, cap at 8
  recommendations.sort((a, b) => b.priority_score - a.priority_score);
  return NextResponse.json(recommendations.slice(0, 8));
}
