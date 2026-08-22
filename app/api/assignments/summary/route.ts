import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { generateText } from "ai";
import { chatModel } from "@/backend/ai/provider";
import { htmlToPlainText } from "@/backend/lms/canvas";
import { assertWithinLimit, UsageLimitError } from "@/backend/billing/limits";
import { runWithUsageContext } from "@/backend/billing/usageContext";

export async function POST(req: Request) {
  try {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const creditCheck = await assertWithinLimit(user.id, "ai_credits");
  if (!creditCheck.ok) {
    return NextResponse.json(
      { error: creditCheck.reason, code: "LIMIT_REACHED" },
      { status: 402 }
    );
  }

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
    .select("title, description, assignment_type, course:courses!inner(name,is_active)")
    .eq("id", assignmentId)
    .eq("user_id", user.id)
    .eq("course.is_active", true)
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
Description: ${htmlToPlainText(assignment.description) ?? assignment.description}`;

  const { text } = await runWithUsageContext(user.id, () =>
    generateText({
      model: chatModel,
      prompt,
      maxTokens: 1200,
    })
  );

  return NextResponse.json({ success: true, summary: text });
  } catch (error) {
    if (error instanceof UsageLimitError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 402 }
      );
    }
    console.error("[/api/assignments/summary] Error:", error);
    return NextResponse.json({ error: "Could not summarize the assignment." }, { status: 500 });
  }
}
