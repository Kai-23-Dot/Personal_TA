import { createClient } from "@/lib/supabase/server";
import { runTAChatAgent, type AgentContext } from "@/lib/ai/agent";
import { type CoreMessage } from "ai";
import { NextResponse } from "next/server";
import { format, addDays } from "date-fns";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { messages, sessionId, context } = body as {
      messages: CoreMessage[];
      sessionId: string;
      context?: string;
    };

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }

    const contextMessage: CoreMessage | null = context
      ? { role: "system", content: `Practice context:\n${context}` }
      : null;

    const enrichedMessages = contextMessage ? [contextMessage, ...messages] : messages;

    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage?.role === "user") {
      supabase.from("chat_messages").insert({
        user_id: user.id,
        session_id: sessionId,
        role: "user",
        content:
          typeof lastUserMessage.content === "string"
            ? lastUserMessage.content
            : JSON.stringify(lastUserMessage.content),
      }).then(({ error }) => {
        if (error) console.warn("[/api/chat/context] Failed to persist message:", error.message);
      });
    }

    const today = format(new Date(), "yyyy-MM-dd");
    const twoWeeksOut = format(addDays(new Date(), 14), "yyyy-MM-dd");

    const [
      { data: assignments },
      { data: exams },
      { data: metrics },
      { data: todayPlan },
    ] = await Promise.all([
      supabase
        .from("assignments")
        .select("*, course:courses(name)")
        .eq("user_id", user.id)
        .gte("due_date", today)
        .lte("due_date", twoWeeksOut)
        .eq("is_completed", false)
        .order("due_date", { ascending: true })
        .limit(20),

      supabase
        .from("assignments")
        .select("*, course:courses(name)")
        .eq("user_id", user.id)
        .in("assignment_type", ["test", "exam", "quiz"])
        .gte("due_date", today)
        .lte("due_date", twoWeeksOut)
        .eq("is_completed", false)
        .order("due_date", { ascending: true })
        .limit(10),

      supabase
        .from("performance_metrics")
        .select("*, course:courses(name)")
        .eq("user_id", user.id)
        .lt("accuracy_pct", 70)
        .order("accuracy_pct", { ascending: true })
        .limit(5),

      supabase
        .from("study_plans")
        .select("*")
        .eq("user_id", user.id)
        .eq("plan_date", today)
        .maybeSingle(),
    ]);

    type AssignmentRow = { title: string; course?: { name: string } | null; due_date: string | null; assignment_type: string; is_completed: boolean; points_possible: number | null };
    type MetricRow = { topic: string; course?: { name: string } | null; accuracy_pct: number; mastery_level: string };
    type PlanTask = { title: string; is_completed: boolean; estimated_minutes: number; task_type: string };

    const contextData: AgentContext = {
      upcomingAssignments: (assignments as AssignmentRow[] ?? []).map((a) => ({
        title: a.title,
        course: a.course?.name ?? "Unknown",
        due_date: a.due_date,
        type: a.assignment_type,
        is_completed: a.is_completed,
        points: a.points_possible,
      })),
      upcomingExams: (exams as AssignmentRow[] ?? []).map((e) => ({
        title: e.title,
        course: e.course?.name ?? "Unknown",
        due_date: e.due_date,
        type: e.assignment_type,
      })),
      weakAreas: (metrics as MetricRow[] ?? []).map((m) => ({
        topic: m.topic,
        course: m.course?.name,
        accuracy: m.accuracy_pct,
        mastery: m.mastery_level,
      })),
      todayPlan: todayPlan
        ? (() => {
            const tasks = (todayPlan.tasks as PlanTask[]) ?? [];
            return {
              has_plan: true,
              total_tasks: tasks.length,
              completed_tasks: tasks.filter((t) => t.is_completed).length,
              tasks: tasks.map((t) => ({
                title: t.title,
                is_completed: t.is_completed,
                minutes: t.estimated_minutes,
                type: t.task_type,
              })),
            };
          })()
        : { has_plan: false },
    };

    const result = await runTAChatAgent(user.id, enrichedMessages, contextData);

    return result.toDataStreamResponse({
      getErrorMessage: (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[/api/chat/context] Stream error:", msg);
        return msg;
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/chat/context] Handler error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
