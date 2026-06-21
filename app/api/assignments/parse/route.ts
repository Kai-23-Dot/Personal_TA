/**
 * POST /api/assignments/parse
 *
 * Accepts a raw text dump (pasted from Canvas, Google Classroom, a syllabus, etc.)
 * and uses AI to extract structured assignments, returning them for user confirmation.
 *
 * Body: { text: string; course_id: string; course_name: string }
 * Returns: { assignments: ParsedAssignment[] }
 */
import { NextResponse } from "next/server";
import { generateText } from "ai";
import { chatModel } from "@/backend/ai/provider";
import { createClient } from "@/backend/supabase/server";

export interface ParsedAssignment {
  title: string;
  assignment_type: "homework" | "quiz" | "test" | "exam" | "project" | "lab" | "essay" | "other";
  due_date: string | null; // ISO date string YYYY-MM-DD or null
  points_possible: number | null;
  description: string | null;
  estimated_minutes: number | null;
}

const SYSTEM_PROMPT = `You are an expert at extracting assignment data from unstructured text.
The user will paste text from a course syllabus, LMS assignment list, or similar source.

Extract ALL assignments, homework, quizzes, tests, projects, and deadlines you find.

Return ONLY a valid JSON array (no markdown fences, no extra text):
[
  {
    "title": "Assignment name",
    "assignment_type": "homework|quiz|test|exam|project|lab|essay|other",
    "due_date": "2024-03-15" or null,
    "points_possible": 100 or null,
    "description": "Brief description if visible" or null,
    "estimated_minutes": 60 or null
  }
]

Rules:
- If the year is not given, infer it from context or use the current academic year.
- Normalize dates to YYYY-MM-DD format.
- For assignment_type, guess from the title/context (e.g. "Quiz 3" → "quiz", "Final Project" → "project").
- Only include items that are actual student deliverables, not lecture dates or readings (unless the reading is graded).
- estimated_minutes: rough guess based on type (homework ~45, quiz ~30, test/exam ~90, project ~180).
- If nothing is extractable, return [].`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text, course_name } = await req.json();

  if (!text?.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const userPrompt = [
    course_name ? `Course: ${course_name}` : null,
    `Today's date: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "TEXT TO PARSE:",
    text.slice(0, 15000), // Cap at ~15k chars
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { text: raw } = await generateText({
      model: chatModel,
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      maxTokens: 2048,
    });

    const cleaned = raw.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const assignments: ParsedAssignment[] = JSON.parse(cleaned);

    return NextResponse.json({ assignments });
  } catch (err) {
    console.error("Assignment parse error:", err);
    return NextResponse.json({ error: "Failed to parse assignments from text" }, { status: 500 });
  }
}
