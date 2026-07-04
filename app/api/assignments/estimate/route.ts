/**
 * POST /api/assignments/estimate
 * AI-estimates study time for all of the user's incomplete assignments
 * and writes the estimates back to the assignments table.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { estimateBatchStudyTime } from "@/backend/ai/studyIntelligence";

export const maxDuration = 60;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: assignments } = await supabase
    .from("assignments")
    .select(`
      id, title, assignment_type, description, due_date,
      points_possible, weight, is_completed, estimated_minutes,
      course:courses(name)
    `)
    .eq("user_id", user.id)
    .eq("is_completed", false)
    .is("estimated_minutes", null)
    .limit(30);

  if (!assignments || assignments.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const rows = (assignments as any[]).map((a) => ({
    ...a,
    course_name: (Array.isArray(a.course) ? a.course[0] : a.course)?.name ?? undefined,
  }));

  const estimates = await estimateBatchStudyTime(rows);

  let updated = 0;
  for (const [id, minutes] of Object.entries(estimates)) {
    const { error } = await supabase
      .from("assignments")
      .update({ estimated_minutes: minutes })
      .eq("id", id)
      .eq("user_id", user.id);
    if (!error) updated++;
  }

  return NextResponse.json({ updated });
}
