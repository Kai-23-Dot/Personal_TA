import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateText } from "ai";
import { chatModel } from "@/lib/ai/provider";

export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { rubricId, submissionText, assignmentId } = body as {
    rubricId: string;
    submissionText: string;
    assignmentId?: string | null;
  };

  if (!rubricId || !submissionText) {
    return NextResponse.json({ error: "rubricId and submissionText required" }, { status: 400 });
  }

  const { data: rubric, error } = await supabase
    .from("rubrics")
    .select("*")
    .eq("id", rubricId)
    .eq("user_id", user.id)
    .single();

  if (error || !rubric) {
    return NextResponse.json({ error: "Rubric not found" }, { status: 404 });
  }

  const prompt = `Evaluate the student's submission against this rubric.
Rubric: ${JSON.stringify(rubric.criteria)}
Submission: ${submissionText}

Return JSON:
{
  "overall_feedback": "...",
  "scores": [{"criterion":"", "points_awarded":0, "points_possible":0, "comment":""}],
  "strengths": ["..."],
  "improvements": ["..."]
}`;

  const { text } = await generateText({
    model: chatModel,
    prompt,
    maxTokens: 1200,
  });

  let feedbackText = text.trim();

  const { data: feedback, error: fbError } = await supabase
    .from("rubric_feedback")
    .insert({
      user_id: user.id,
      rubric_id: rubricId,
      assignment_id: assignmentId ?? null,
      submission_text: submissionText,
      feedback: feedbackText,
      score_summary: {},
    })
    .select()
    .single();

  if (fbError) return NextResponse.json({ error: fbError.message }, { status: 500 });

  return NextResponse.json({ success: true, feedback });
}
