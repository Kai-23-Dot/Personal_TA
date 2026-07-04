/**
 * Study Intelligence Engine
 * - AI-powered study time estimation per assignment
 * - Priority scoring across all courses simultaneously
 * - Smart "start today" reminder generation
 * - Weekly study schedule builder
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

export interface PrioritizedAssignment extends AssignmentInput {
  priority_score: number;        // 0-100
  recommended_start: string | null; // ISO date when student should start
  smart_reminder: string | null;
  final_estimated_minutes: number;
}

export interface StudyBlock {
  day: string;                   // "Monday" … "Sunday"
  subject: string;
  task: string;
  durationMinutes: number;
  assignmentId: string;
  priority: "high" | "medium" | "low";
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

// ── Priority scoring ────────────────────────────────────────────────────────

/**
 * Score 0-100. Higher = tackle this first.
 * Factors: time-to-deadline (50 pts), assignment gravity (30 pts), grade weight (20 pts).
 */
export function calcPriorityScore(a: AssignmentInput, estimatedMinutes: number): number {
  if (a.is_completed) return 0;
  if (!a.due_date) return 5;

  const daysLeft = (new Date(a.due_date).getTime() - Date.now()) / 86_400_000;

  // 1. Urgency
  let urgency = 0;
  if (daysLeft <= 0)  urgency = 50;
  else if (daysLeft <= 0.5) urgency = 48;
  else if (daysLeft <= 1)   urgency = 44;
  else if (daysLeft <= 2)   urgency = 38;
  else if (daysLeft <= 3)   urgency = 30;
  else if (daysLeft <= 5)   urgency = 20;
  else if (daysLeft <= 7)   urgency = 12;
  else urgency = Math.max(0, 8 - daysLeft * 0.5);

  // 2. Assignment gravity
  const gravity: Record<string, number> = {
    exam: 30, test: 28, essay: 22, project: 22,
    lab: 16, quiz: 14, homework: 10, reading: 7, other: 8,
  };
  const gravityScore = (gravity[a.assignment_type] ?? 8) * 0.9;

  // 3. Grade weight
  let gradeScore = 0;
  if (a.weight && a.weight > 0)            gradeScore = Math.min(20, a.weight / 5);
  else if (a.points_possible && a.points_possible > 0) gradeScore = Math.min(15, a.points_possible / 20);
  else gradeScore = 6;

  // 4. Time required relative to days left (time pressure)
  const hoursLeft = daysLeft * 6; // ~6 productive hrs/day
  const hoursNeeded = estimatedMinutes / 60;
  const timePressure = hoursLeft > 0 ? Math.min(10, (hoursNeeded / hoursLeft) * 20) : 10;

  return Math.min(100, Math.round(urgency + gravityScore + gradeScore + timePressure));
}

// ── Smart reminders ─────────────────────────────────────────────────────────

export function buildSmartReminder(a: AssignmentInput, estimatedMinutes: number): string | null {
  if (!a.due_date || a.is_completed) return null;

  const daysLeft  = (new Date(a.due_date).getTime() - Date.now()) / 86_400_000;
  const hoursEst  = estimatedMinutes / 60;
  // Assume 2h productive work/day is realistic for a student
  const daysNeeded = Math.ceil(hoursEst / 2);
  const startInDays = daysLeft - daysNeeded;

  if (daysLeft <= 0)        return `⚠️ Past due — submit ASAP.`;
  if (startInDays <= 0)     return `🔥 Start today — you need ~${hoursEst % 1 === 0 ? hoursEst : hoursEst.toFixed(1)}h and it's due in ${Math.ceil(daysLeft)} day${Math.ceil(daysLeft) === 1 ? "" : "s"}.`;
  if (startInDays <= 1)     return `📅 Start tomorrow — ${hoursEst.toFixed(1)}h of work, due in ${Math.ceil(daysLeft)} days.`;
  if (startInDays <= 2)     return `📌 Start in 2 days to stay on track.`;
  return null;
}

// ── Prioritize all assignments ──────────────────────────────────────────────

export async function prioritizeAssignments(
  assignments: AssignmentInput[]
): Promise<PrioritizedAssignment[]> {
  const estimates = await estimateBatchStudyTime(assignments);

  return assignments
    .filter((a) => !a.is_completed)
    .map((a) => {
      const minutes = estimates[a.id] ?? FALLBACK_MINUTES[a.assignment_type] ?? 45;
      const score   = calcPriorityScore(a, minutes);

      // Compute recommended start date
      let recommendedStart: string | null = null;
      if (a.due_date) {
        const daysNeeded = Math.ceil(minutes / 120); // 2h/day
        const startDate  = new Date(a.due_date);
        startDate.setDate(startDate.getDate() - daysNeeded);
        // Don't recommend start dates in the past
        recommendedStart = startDate < new Date()
          ? new Date().toISOString()
          : startDate.toISOString();
      }

      return {
        ...a,
        priority_score:          score,
        recommended_start:       recommendedStart,
        smart_reminder:          buildSmartReminder(a, minutes),
        final_estimated_minutes: minutes,
      };
    })
    .sort((a, b) => b.priority_score - a.priority_score);
}

// ── Weekly schedule ─────────────────────────────────────────────────────────

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function todayDayIndex(): number {
  // 0=Mon … 6=Sun to match DAYS array
  const d = new Date().getDay(); // 0=Sun, 1=Mon …
  return d === 0 ? 6 : d - 1;
}

export function buildWeeklySchedule(
  prioritized: PrioritizedAssignment[]
): StudyBlock[] {
  const schedule: StudyBlock[] = [];
  const todayIdx = todayDayIndex();

  // Track minutes already scheduled per day (cap at 180 min = 3h)
  const dayLoad = new Array(7).fill(0);
  const MAX_PER_DAY = 180;

  for (const a of prioritized) {
    if (a.priority_score < 5) continue;
    let remaining = a.final_estimated_minutes;
    const daysLeft = a.due_date
      ? Math.max(0, Math.ceil((new Date(a.due_date).getTime() - Date.now()) / 86_400_000))
      : 7;

    // Try to spread sessions starting from today, fitting before due date
    for (let d = 0; d < 7 && remaining > 0; d++) {
      const dayIdx = (todayIdx + d) % 7;

      // Don't schedule beyond due date
      if (d >= daysLeft && daysLeft < 7) continue;

      const available = MAX_PER_DAY - dayLoad[dayIdx];
      if (available <= 0) continue;

      const session = Math.min(remaining, available, 90); // max 90 min per session
      remaining -= session;
      dayLoad[dayIdx] += session;

      schedule.push({
        day: DAYS[dayIdx],
        subject: a.course_name ?? "Study",
        task: a.title,
        durationMinutes: session,
        assignmentId: a.id,
        priority: daysLeft <= 2 ? "high" : daysLeft <= 5 ? "medium" : "low",
      });
    }
  }

  // Sort by day order
  const order = [...DAYS.slice(todayIdx), ...DAYS.slice(0, todayIdx)];
  return schedule.sort((a, b) => order.indexOf(a.day) - order.indexOf(b.day));
}
