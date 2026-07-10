/**
 * GET /api/groups/stats → the investor metric: % of goal-bound groups that
 * complete their stated goal.
 *
 * Most platforms can't measure this because their groups have no defined end;
 * ours do, so the aggregate is a single flat query over study_groups' goal
 * columns fed through the same tested completion logic the UI uses.
 *
 * Currently visible to any authenticated user; gate on profiles.role if it
 * should become admin-only.
 */
import { createClient, createServiceClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import { computeCompletionStats } from "@/backend/groups/completion";

export async function GET() {
  const supabase = await createClient();
  const admin    = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: rows, error } = await admin
    .from("study_groups")
    .select("goal, target_end_date, goal_completed_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stats = computeCompletionStats(
    (rows ?? []).map((r) => ({
      goal:            r.goal,
      targetEndDate:   r.target_end_date,
      goalCompletedAt: r.goal_completed_at,
    })),
    new Date()
  );

  return NextResponse.json(stats);
}
