import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateText } from "ai";
import { chatModel } from "@/lib/ai/provider";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { assignmentId } = await req.json();
  if (!assignmentId) return NextResponse.json({ error: "assignmentId required" }, { status: 400 });

  type AssignmentSummaryRow = {
    title: string;
    description: string | null;
    assignment_type: string | null;
    course: { name: string } | { name: string }[] | null;
  };

  const { data } = await supabase
    .from("assignments")
    .select("title, description, assignment_type, course:courses(name)")
    .eq("id", assignmentId)
    .eq("user_id", user.id)
    .single();
  const assignment = data as AssignmentSummaryRow | null;

  if (!assignment?.description) {
    return NextResponse.json({ error: "Assignment description not available" }, { status: 400 });
  }

  const courseName = Array.isArray(assignment?.course)
    ? assignment?.course[0]?.name
    : assignment?.course?.name;

  const prompt = `Summarize this assignment for a student. Provide:
1) Concise summary (2-3 sentences)
2) Cheat sheet checklist (bullets)
3) Key requirements (bullets)

Assignment: ${assignment.title}
Course: ${courseName ?? "Unknown"}
Type: ${assignment.assignment_type}
Description: ${assignment.description}`;

  const { text } = await generateText({
    model: chatModel,
    prompt,
    maxTokens: 1200,
  });

  return NextResponse.json({ success: true, summary: text });
}
