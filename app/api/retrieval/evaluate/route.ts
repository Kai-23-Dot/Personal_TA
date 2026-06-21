import { NextResponse } from "next/server";
import { evaluateRetrieval } from "@/backend/canvas-intelligence/retrievalEvaluation";
import { sampleEvaluationCases } from "@/backend/canvas-intelligence/evalCases";

export async function GET() {
  const cases = sampleEvaluationCases();
  const metrics = evaluateRetrieval(cases);
  return NextResponse.json({
    cases: cases.map((c) => ({ id: c.id, label: c.label })),
    metrics,
  });
}
