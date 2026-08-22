/**
 * POST /api/assignments/estimate
 * AI-estimates study time for all of the user's incomplete assignments
 * and writes the estimates back to the assignments table.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { estimateBatchStudyTime } from "@/backend/ai/studyIntelligence";
import { assertWithinLimit, UsageLimitError } from "@/backend/billing/limits";
import { runWithUsageContext } from "@/backend/billing/usageContext";

export const maxDuration = 60;

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const creditCheck = await assertWithinLimit(user.id, "ai_credits");
    if (!creditCheck.ok) {
      return NextResponse.json(
        { error: creditCheck.reason, code: "LIMIT_REACHED" },
        { status: 402 }
      );
    }

  const { data: assignments } = await supabase
    .from("assignments")
    .select(`
      id, title, assignment_type, description, due_date,
      points_possible, weight, is_completed, estimated_minutes,
      course:courses!inner(name, is_active)
    `)
    .eq("user_id", user.id)
    .eq("course.is_active", true)
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

    const estimates = await runWithUsageContext(user.id, () =>
      estimateBatchStudyTime(rows)
    );

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
  } catch (error) {
    if (error instanceof UsageLimitError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 402 }
      );
    }
    console.error("[/api/assignments/estimate] Error:", error);
    return NextResponse.json({ error: "Could not estimate assignments." }, { status: 500 });
  }
}
