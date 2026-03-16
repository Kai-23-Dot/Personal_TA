import { generateText } from "ai";
import { chatModel } from "./provider";
import { v4 as uuidv4 } from "uuid";
import type { Assignment, StudyTask } from "@/types";

export interface PlannerInput {
  date: string; // YYYY-MM-DD
  assignments: Assignment[];
  availableMinutes?: number;
  existingTasks?: StudyTask[];
  notes?: string;
}

export interface PlannerOutput {
  tasks: StudyTask[];
  totalMinutes: number;
  plannerNotes: string;
}

type RawTask = {
  title: string;
  description?: string;
  course_name?: string;
  task_type: "homework" | "study" | "review" | "practice" | "read";
  estimated_minutes: number;
  is_completed: boolean;
  priority: "high" | "medium" | "low";
  start_time?: string;
};

type RawPlan = {
  tasks: RawTask[];
  total_minutes: number;
  planner_notes: string;
};

export async function generateStudyPlan(input: PlannerInput): Promise<PlannerOutput> {
  const { date, assignments, availableMinutes = 180, notes } = input;

  const assignmentContext = assignments
    .slice(0, 15)
    .map((a) => {
      const daysUntilDue = a.due_date
        ? Math.round((new Date(a.due_date).getTime() - new Date(date).getTime()) / 86400000)
        : null;
      return [
        `- Title: ${a.title}`,
        `  Course: ${(a as Assignment & { course?: { name: string } }).course?.name ?? "Unknown"}`,
        `  Type: ${a.assignment_type}`,
        daysUntilDue !== null ? `  Due in: ${daysUntilDue} days` : "  Due: no date",
        a.points_possible ? `  Points: ${a.points_possible}` : "",
        a.estimated_minutes ? `  Estimated: ${a.estimated_minutes}min` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const prompt = [
    `Create a realistic, prioritized daily study plan for a high school student.`,
    `Planning date: ${date}`,
    `Available study time: ${availableMinutes} minutes (fit all tasks within this limit).`,
    `Prioritize by urgency (due date) and importance (points). Mix homework, study, review, practice.`,
    notes ? `Student note: ${notes}` : null,
    "",
    "ASSIGNMENTS & WORKLOAD:",
    assignmentContext || "No assignments synced yet — create general study tasks.",
    `\nReturn ONLY a valid JSON object — no markdown fences, no extra commentary. Format:
{
  "tasks": [
    {
      "title": "...",
      "description": "...",
      "course_name": "...",
      "task_type": "homework",
      "estimated_minutes": 30,
      "is_completed": false,
      "priority": "high",
      "start_time": "4:00 PM"
    }
  ],
  "total_minutes": 120,
  "planner_notes": "Brief overview of the plan and prioritization logic."
}
task_type must be one of: homework, study, review, practice, read.
priority must be one of: high, medium, low.`,
  ]
    .filter(Boolean)
    .join("\n");

  const { text } = await generateText({
    model: chatModel,
    prompt,
    maxTokens: 4000,
  });

  const stripped = text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error("Study plan generation failed: no JSON object in response");
  }

  let raw: RawPlan;
  try {
    raw = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    throw new Error("Study plan generation failed: could not parse AI response as JSON");
  }

  const tasks: StudyTask[] = (raw.tasks ?? []).map((t) => ({
    ...t,
    id: uuidv4(),
    is_completed: false,
    description: t.description ?? "",
    course_name: t.course_name ?? "",
    start_time: t.start_time,
  }));

  return {
    tasks,
    totalMinutes: raw.total_minutes ?? 0,
    plannerNotes: raw.planner_notes ?? "",
  };
}
