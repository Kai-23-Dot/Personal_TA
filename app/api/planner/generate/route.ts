import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateStudyPlan } from "@/lib/ai/studyPlanner";
import { addDays, format } from "date-fns";
import type { Assignment } from "@/types";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { date } = body as { date: string };

    if (!date) {
      return NextResponse.json({ success: false, error: "date is required (YYYY-MM-DD)" }, { status: 400 });
    }

    // Fetch upcoming assignments (next 14 days from plan date)
    const endDate = format(addDays(new Date(date), 14), "yyyy-MM-dd");
    const { data: assignments } = await supabase
      .from("assignments")
      .select("*, course:courses(name, color)")
      .eq("user_id", user.id)
      .eq("is_completed", false)
      .lte("due_date", endDate)
      .order("due_date", { ascending: true })
      .limit(20);

    // Generate plan
    const { tasks, totalMinutes, plannerNotes } = await generateStudyPlan({
      date,
      assignments: (assignments as Assignment[]) ?? [],
      availableMinutes: 180,
    });

    // Upsert study plan (replace existing for that date)
    const { data: plan, error } = await supabase
      .from("study_plans")
      .upsert(
        {
          user_id: user.id,
          plan_date: date,
          status: "active",
          tasks,
          total_minutes: totalMinutes,
          completed_minutes: 0,
          generated_by: "ai",
          notes: plannerNotes,
        },
        { onConflict: "user_id,plan_date" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, plan });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/planner/generate] Error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
