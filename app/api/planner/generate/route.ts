import { createClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import { generateStudyPlan } from "@/backend/ai/studyPlanner";
import { addDays, format } from "date-fns";
import type { Assignment } from "@/types";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { date, availability, availableMinutes } = body as {
      date: string;
      availability?: Array<{ day_of_week: number; start_time: string; end_time: string; preferred_block_minutes?: number }>;
      availableMinutes?: number;
    };

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
    const dayOfWeek = new Date(date).getDay();
    const dayAvailability = (availability ?? []).filter((slot) => slot.day_of_week === dayOfWeek);
    const derivedMinutes = dayAvailability.reduce((sum, slot) => {
      const [startH, startM] = slot.start_time.split(":").map(Number);
      const [endH, endM] = slot.end_time.split(":").map(Number);
      const minutes = (endH * 60 + endM) - (startH * 60 + startM);
      return sum + Math.max(0, minutes);
    }, 0);

    const { tasks, totalMinutes, plannerNotes } = await generateStudyPlan({
      date,
      assignments: (assignments as Assignment[]) ?? [],
      availableMinutes: availableMinutes ?? (derivedMinutes || 180),
      availability: availability ?? [],
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

    // Create study blocks for the day (best-effort)
    if (tasks.length > 0) {
      await supabase
        .from("study_blocks")
        .delete()
        .eq("user_id", user.id)
        .eq("plan_date", date);

      const preferredMinutes = dayAvailability[0]?.preferred_block_minutes ?? 45;
      const baseStart = dayAvailability[0]?.start_time ?? "16:00";

      const normalizeTime = (input: string) => {
        const trimmed = input.trim();
        if (/\b(am|pm)\b/i.test(trimmed)) {
          const match = trimmed.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
          if (!match) return null;
          let hours = Number(match[1]);
          const minutes = Number(match[2] ?? "0");
          const period = match[3].toLowerCase();
          if (period === "pm" && hours < 12) hours += 12;
          if (period === "am" && hours === 12) hours = 0;
          return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
        }
        if (/^\d{1,2}:\d{2}$/.test(trimmed)) return trimmed;
        return null;
      };

      const blocks = tasks.map((task, idx) => {
        const normalized = task.start_time ? normalizeTime(task.start_time) : null;
        const fallbackStart = new Date(`${date}T${baseStart}:00`);
        const startDate = normalized
          ? new Date(`${date}T${normalized}:00`)
          : new Date(fallbackStart.getTime() + idx * preferredMinutes * 60000);
        const endDate = new Date(startDate.getTime() + (task.estimated_minutes ?? preferredMinutes) * 60000);
        return {
          user_id: user.id,
          plan_date: date,
          title: task.title,
          task_type: task.task_type,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          course_id: (task as { course_id?: string }).course_id ?? null,
          assignment_id: (task as { assignment_id?: string }).assignment_id ?? null,
          status: "scheduled",
        };
      });

      await supabase.from("study_blocks").insert(blocks);
    }

    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "Study plan generated",
      body: `Your plan for ${date} is ready.`,
      type: "system",
    });

    return NextResponse.json({ success: true, plan });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/planner/generate] Error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
