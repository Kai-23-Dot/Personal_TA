/**
 * GET /api/study/heatmap
 * Returns weekly workload data for a heatmap visualization.
 * Each item: { week: "2024-W12", courseId, courseName, assignmentCount, totalEstimatedHours }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch upcoming assignments with due dates in the next 12 weeks
  const since = new Date();
  const until = new Date(Date.now() + 12 * 7 * 86_400_000);

  const { data: raw } = await supabase
    .from("assignments")
    .select(`
      id, due_date, estimated_minutes, assignment_type, points_possible, weight,
      course:courses(id, name, color)
    `)
    .eq("user_id", user.id)
    .eq("is_completed", false)
    .gte("due_date", since.toISOString())
    .lte("due_date", until.toISOString())
    .not("due_date", "is", null);

  if (!raw) return NextResponse.json([]);

  // Group by ISO week + course
  type WeekKey = string;
  const buckets = new Map<WeekKey, {
    week: string; courseId: string; courseName: string; courseColor: string | null;
    count: number; estimatedMinutes: number; hasHighStakes: boolean;
  }>();

  for (const a of raw as any[]) {
    const due = new Date(a.due_date);
    const weekNum = getISOWeek(due);
    const year    = due.getFullYear();
    const week    = `${year}-W${String(weekNum).padStart(2, "0")}`;
    const c       = Array.isArray(a.course) ? a.course[0] : a.course;
    const courseId = c?.id ?? "unknown";
    const key = `${week}|${courseId}`;

    const existing = buckets.get(key) ?? {
      week,
      courseId,
      courseName: c?.name ?? "Unknown",
      courseColor: c?.color ?? null,
      count: 0,
      estimatedMinutes: 0,
      hasHighStakes: false,
    };

    existing.count++;
    existing.estimatedMinutes += a.estimated_minutes ?? fallbackMinutes(a.assignment_type);
    if (["exam", "test", "essay", "project"].includes(a.assignment_type)) {
      existing.hasHighStakes = true;
    }
    buckets.set(key, existing);
  }

  const result = Array.from(buckets.values()).sort((a, b) => a.week.localeCompare(b.week));
  return NextResponse.json(result);
}

function getISOWeek(date: Date): number {
  const d = new Date(date.valueOf());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function fallbackMinutes(type: string): number {
  const map: Record<string, number> = {
    homework: 45, essay: 120, quiz: 30, test: 90, exam: 120,
    lab: 90, project: 180, reading: 45, other: 45,
  };
  return map[type] ?? 45;
}
