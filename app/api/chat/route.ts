import { createClient } from "@/lib/supabase/server";
import { runTAChatAgent, type AgentContext } from "@/lib/ai/agent";
import { retrieveRelevantContext, formatContextForPrompt } from "@/lib/utils/rag";
import { type CoreMessage } from "ai";
import { NextResponse } from "next/server";
import { format, addDays } from "date-fns";

/** Convert Vercel AI SDK UI messages (which may carry experimental_attachments)
 *  into CoreMessage[] with proper image content parts for vision models. */
function toCoreMsgs(rawMessages: any[]): CoreMessage[] {
  return rawMessages.map((msg) => {
    if (msg.role === "user") {
      const attachments: Array<{ contentType?: string; url: string; name?: string }> =
        msg.experimental_attachments ?? [];
      const imageAtts = attachments.filter((a) => a.contentType?.startsWith("image/"));

      if (imageAtts.length > 0) {
        const parts: any[] = [];
        if (msg.content) parts.push({ type: "text", text: String(msg.content) });
        for (const att of imageAtts) {
          parts.push({ type: "image", image: att.url, mimeType: att.contentType as any });
        }
        return { role: "user", content: parts } as CoreMessage;
      }
    }
    return {
      role: msg.role as "user" | "assistant" | "system",
      content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
    } as CoreMessage;
  });
}

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { messages: rawMessages, sessionId, noteId, assignmentId } = body as {
      messages: any[];
      sessionId: string;
      noteId?: string;
      assignmentId?: string;
    };

    if (!rawMessages || !Array.isArray(rawMessages)) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }

    // Convert UI messages (with experimental_attachments) → CoreMessages with image parts
    const messages = toCoreMsgs(rawMessages);

    // Persist the latest user message (best-effort)
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
        if (error) console.warn("[/api/chat] Failed to persist message:", error.message);
      });
    }

    // Pre-fetch student context (Sarvam doesn't support tool calling)
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

    const context: AgentContext = {
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

    const lastUserText = lastUserMessage
      ? typeof lastUserMessage.content === "string"
        ? lastUserMessage.content
        : (lastUserMessage.content as any[])
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join(" ")
      : "";
    let ragResults = lastUserText ? await retrieveRelevantContext(user.id, lastUserText, 6) : [];

    if (noteId) {
      const { data: note } = await supabase
        .from("notes")
        .select("title, content, course_id")
        .eq("id", noteId)
        .eq("user_id", user.id)
        .single();
      if (note?.content) {
        ragResults = [
          { id: noteId, title: note.title, content: note.content.slice(0, 2000), course_id: note.course_id, similarity: 1, source: "note" as const },
          ...ragResults,
        ];
      }
    }

    if (assignmentId) {
      const { data: assignment } = await supabase
        .from("assignments")
        .select("title, description")
        .eq("id", assignmentId)
        .eq("user_id", user.id)
        .single();
      if (assignment?.description) {
        ragResults = [
          { id: assignmentId, title: assignment.title, content: assignment.description.slice(0, 2000), course_id: null, similarity: 1, source: "summary" as const },
          ...ragResults,
        ];
      }
    }

    const ragContext = formatContextForPrompt(ragResults);

    const result = await runTAChatAgent(user.id, messages, context, ragContext);

    return result.toDataStreamResponse({
      getErrorMessage: (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[/api/chat] Stream error:", msg);
        return msg;
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/chat] Handler error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
