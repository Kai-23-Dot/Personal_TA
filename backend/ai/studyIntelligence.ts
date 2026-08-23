/**
 * AI-powered completion-time estimation for assignments.
 */

import { generateText } from "ai";
import { fastModel } from "./provider";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AssignmentInput {
  id: string;
  title: string;
  assignment_type: string;
  description?: string | null;
  due_date: string | null;
  points_possible: number | null;
  weight: number | null;
  is_completed: boolean;
  estimated_minutes: number | null;
  course_name?: string;
}

// ── Time estimation ─────────────────────────────────────────────────────────

const FALLBACK_MINUTES: Record<string, number> = {
  homework: 45, essay: 120, quiz: 30, test: 90, exam: 120,
  lab: 90, project: 180, reading: 45, other: 45,
};

/**
 * Estimate study time for a batch of assignments using a single AI call.
 * Returns a map of assignment id → estimated minutes.
 */
export async function estimateBatchStudyTime(
  assignments: AssignmentInput[]
): Promise<Record<string, number>> {
  const needsEstimate = assignments.filter(
    (a) => !a.is_completed && !a.estimated_minutes
  );

  const result: Record<string, number> = {};

  // Seed with existing estimates
  assignments.forEach((a) => {
    if (a.estimated_minutes) result[a.id] = a.estimated_minutes;
  });

  if (needsEstimate.length === 0) return result;

  const items = needsEstimate.map((a, i) => ({
    idx: i,
    id: a.id,
    title: a.title,
    type: a.assignment_type,
    course: a.course_name ?? "Unknown",
    points: a.points_possible ?? "?",
    desc: (a.description ?? "").slice(0, 200),
  }));

  const prompt = `You are an academic advisor estimating completion time (in minutes) for a high school student.
Grade benchmarks: homework 30-60, reading 30-60, quiz prep 20-45, test prep 60-120, exam prep 90-180, essay 90-180, lab 60-120, project 120-360.

Assignments:
${items.map((a) => `[${a.idx}] "${a.title}" | type:${a.type} | course:${a.course} | pts:${a.points}${a.desc ? " | " + a.desc : ""}`).join("\n")}

Return ONLY valid JSON: {"estimates": [{"idx":0,"minutes":45}, ...]}
One entry per assignment. Be realistic — not too fast, not too slow.`;

  try {
    const { text } = await generateText({ model: fastModel, prompt, maxTokens: 500 });
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { estimates: { idx: number; minutes: number }[] };
    for (const e of parsed.estimates) {
      const a = items[e.idx];
      if (a) result[a.id] = Math.max(15, Math.round(e.minutes));
    }
  } catch {
    // Fallback per type
    needsEstimate.forEach((a) => {
      result[a.id] = FALLBACK_MINUTES[a.assignment_type] ?? 45;
    });
  }

  return result;
}
