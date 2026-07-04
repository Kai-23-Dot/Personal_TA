/**
 * GET /api/study/grade-impact
 * Returns upcoming incomplete assignments ranked by their impact on final grade,
 * plus "danger zone" alerts for overlapping high-stakes assignments.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cutoff = new Date(Date.now() + 21 * 86_400_000); // next 3 weeks

  const { data: raw } = await supabase
    .from("assignments")
    .select(`
      id, title, assignment_type, due_date, points_possible, weight,
      is_completed, estimated_minutes,
      course:courses(id, name, color)
    `)
    .eq("user_id", user.id)
    .eq("is_completed", false)
    .gte("due_date", new Date().toISOString())
    .lte("due_date", cutoff.toISOString())
    .not("due_date", "is", null);

  if (!raw) return NextResponse.json({ items: [], dangerZones: [] });

  // Compute impact scores
  const HIGH_STAKES = new Set(["exam", "test", "essay", "project"]);

  const items = (raw as any[]).map((a) => {
    const c = Array.isArray(a.course) ? a.course[0] : a.course;
    const daysLeft = (new Date(a.due_date).getTime() - Date.now()) / 86_400_000;

    // Impact: weight % > points_possible > type heuristic
    let impactPct = 0;
    if (a.weight && a.weight > 0) {
      impactPct = Math.min(a.weight, 50); // cap display at 50%
    } else if (a.points_possible && a.points_possible > 0) {
      // Rough heuristic: high point values suggest higher grade impact
      impactPct = Math.min(20, Math.round(a.points_possible / 5));
    } else {
      const defaults: Record<string, number> = {
        exam: 25, test: 20, essay: 15, project: 15,
        quiz: 10, lab: 8, homework: 5, reading: 3, other: 5,
      };
      impactPct = defaults[a.assignment_type] ?? 5;
    }

    return {
      id: a.id,
      title: a.title,
      assignment_type: a.assignment_type,
      due_date: a.due_date,
      daysLeft: Math.round(daysLeft),
      courseId: c?.id ?? null,
      courseName: c?.name ?? "Unknown",
      courseColor: c?.color ?? null,
      impactPct,
      estimated_minutes: a.estimated_minutes,
      isHighStakes: HIGH_STAKES.has(a.assignment_type),
    };
  }).sort((a, b) => b.impactPct - a.impactPct);

  // Danger zones: multiple high-stakes items due within 2 days of each other
  const highStakes = items.filter((i) => i.isHighStakes);
  const dangerZones: { label: string; assignments: string[] }[] = [];

  for (let i = 0; i < highStakes.length; i++) {
    for (let j = i + 1; j < highStakes.length; j++) {
      const diffDays = Math.abs(highStakes[i].daysLeft - highStakes[j].daysLeft);
      if (diffDays <= 2 && highStakes[i].courseId !== highStakes[j].courseId) {
        dangerZones.push({
          label: `${highStakes[i].title} (${highStakes[i].courseName}) and ${highStakes[j].title} (${highStakes[j].courseName}) overlap within ${diffDays === 0 ? "the same day" : diffDays + " day(s)"}`,
          assignments: [highStakes[i].id, highStakes[j].id],
        });
      }
    }
  }

  return NextResponse.json({ items, dangerZones });
}
