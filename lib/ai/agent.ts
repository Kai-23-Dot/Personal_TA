/**
 * PersonalTA.ai — TA Chat Agent
 *
 * Uses Vercel AI SDK streamText with Sarvam AI (sarvam-m).
 * Note: Sarvam does not support function/tool calling, so student data is
 * pre-fetched in the API route and injected into the system prompt as context.
 *
 * The agent is invoked from /api/chat/route.ts via streamText.
 */

import { streamText, type CoreMessage } from "ai";
import { chatModel } from "./provider";
import { format } from "date-fns";

// ---- Pre-fetched context shape (populated by /api/chat/route.ts) ----

export interface AgentContext {
  upcomingAssignments?: Array<{
    title: string;
    course: string;
    due_date: string | null;
    type: string;
    is_completed: boolean;
    points: number | null;
  }>;
  upcomingExams?: Array<{
    title: string;
    course: string;
    due_date: string | null;
    type: string;
  }>;
  weakAreas?: Array<{
    topic: string;
    course: string | undefined;
    accuracy: number;
    mastery: string;
  }>;
  todayPlan?: {
    has_plan: boolean;
    total_tasks?: number;
    completed_tasks?: number;
    tasks?: Array<{ title: string; is_completed: boolean; minutes: number; type: string }>;
  };
}

// ---- Build context block from pre-fetched data ----

function buildContextBlock(ctx?: AgentContext): string {
  if (!ctx) return "";

  const lines: string[] = ["\n\n--- STUDENT DATA (pre-fetched, use this to answer questions) ---"];

  if (ctx.upcomingAssignments && ctx.upcomingAssignments.length > 0) {
    lines.push("\nUPCOMING ASSIGNMENTS (next 14 days):");
    for (const a of ctx.upcomingAssignments) {
      const due = a.due_date ? format(new Date(a.due_date), "MMM d") : "No date";
      lines.push(`  • [${a.type}] ${a.title} — ${a.course} — Due: ${due}${a.points ? ` (${a.points}pts)` : ""}${a.is_completed ? " ✓" : ""}`);
    }
  } else {
    lines.push("\nUPCOMING ASSIGNMENTS: None in the next 14 days.");
  }

  if (ctx.upcomingExams && ctx.upcomingExams.length > 0) {
    lines.push("\nUPCOMING TESTS & EXAMS:");
    for (const e of ctx.upcomingExams) {
      const due = e.due_date ? format(new Date(e.due_date), "MMM d") : "No date";
      lines.push(`  • [${e.type}] ${e.title} — ${e.course} — ${due}`);
    }
  } else {
    lines.push("\nUPCOMING TESTS & EXAMS: None scheduled.");
  }

  if (ctx.weakAreas && ctx.weakAreas.length > 0) {
    lines.push("\nWEAK AREAS (lowest accuracy in practice):");
    for (const w of ctx.weakAreas) {
      lines.push(`  • ${w.topic}${w.course ? ` (${w.course})` : ""} — ${w.accuracy}% accuracy — ${w.mastery}`);
    }
  }

  if (ctx.todayPlan) {
    if (ctx.todayPlan.has_plan && ctx.todayPlan.tasks) {
      lines.push(`\nTODAY'S STUDY PLAN (${ctx.todayPlan.completed_tasks}/${ctx.todayPlan.total_tasks} tasks done):`);
      for (const t of ctx.todayPlan.tasks) {
        lines.push(`  ${t.is_completed ? "✓" : "○"} ${t.title} (~${t.minutes}min, ${t.type})`);
      }
    } else {
      lines.push("\nTODAY'S STUDY PLAN: No plan generated yet.");
    }
  }

  lines.push("--- END STUDENT DATA ---");
  return lines.join("\n");
}

// ---- System prompt ----

const BASE_SYSTEM_PROMPT = `You are PersonalTA — an expert, supportive AI Teaching Assistant for a high school student.

PERSONALITY: Encouraging, clear, and student-friendly. Like the best TA you've ever had.

CAPABILITIES:
- You have access to the student's real assignments, notes, summaries, and performance data (provided in STUDENT DATA below).
- Answer questions about upcoming deadlines, tests, and study priorities using that data.

BEHAVIOR:
1. For concept explanations: Break it down step-by-step using simple language and real examples.
2. For code debugging: Go line-by-line, explain WHY it's wrong, and show the fix.
3. For math: Show each step. Use clear notation.
4. For essay help: Focus on structure, argument, and evidence — don't write the essay for them.
5. When asked what's due: Reference the UPCOMING ASSIGNMENTS data.
6. When asked about exams: Reference the UPCOMING TESTS & EXAMS data.
7. When asked for practice or quizzes: Suggest specific topics from weak areas and direct them to the Practice section of the app.
8. Always cite when using student data: "According to your assignments..." or "Based on your weak areas..."

FORMATTING:
- Use markdown: headers, bold, code blocks, bullet points.
- Keep responses focused and scannable — no walls of text.
- Use code blocks for ALL code, with language tags.

Today's date: ${format(new Date(), "EEEE, MMMM d, yyyy")}`;

// ---- Main agent function ----

// Return type is intentionally widened to avoid TS2322
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runTAChatAgent(
  userId: string,
  messages: CoreMessage[],
  context?: AgentContext,
  ragContext?: string
): Promise<any> {
  void userId; // kept in signature for API compatibility
  const systemPrompt = BASE_SYSTEM_PROMPT + buildContextBlock(context) + (ragContext ?? "");

  return streamText({
    model: chatModel,
    system: systemPrompt,
    messages,
    temperature: 0.7,
    onError: ({ error }) => {
      console.error("[TA Agent] streamText error:", error);
    },
  });
}
