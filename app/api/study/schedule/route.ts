/**
 * GET /api/study/schedule
 * Returns a generated weekly study schedule based on priority-ranked assignments.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { prioritizeAssignments, buildWeeklySchedule } from "@/backend/ai/studyIntelligence";

export const maxDuration = 60;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: raw } = await supabase
    .from("assignments")
    .select(`
      id, title, assignment_type, description, due_date,
      points_possible, weight, is_completed, estimated_minutes,
      course:courses(id, name, color)
    `)
    .eq("user_id", user.id)
    .eq("is_completed", false)
    .or(`due_date.is.null,due_date.gte.${new Date().toISOString()}`)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(40);

  if (!raw || raw.length === 0) return NextResponse.json([]);

  const assignments = (raw as any[]).map((a) => {
    const c = Array.isArray(a.course) ? a.course[0] : a.course;
    return { ...a, course_name: c?.name ?? undefined };
  });

  const prioritized = await prioritizeAssignments(assignments);
  const schedule    = buildWeeklySchedule(prioritized);
  return NextResponse.json(schedule);
}
