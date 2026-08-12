import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { retrieveRankedSources } from "@/backend/canvas-intelligence/hybridRetriever";
import { z } from "zod";

const noteSearchSchema = z.object({
  courseId: z.string().uuid().nullable().optional(),
  query: z.string().trim().min(1).max(500),
}).strict();

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = noteSearchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid search query is required." }, { status: 400 });
  }
  const { query, courseId } = parsed.data;

  let retrieval: Awaited<ReturnType<typeof retrieveRankedSources>>;
  try {
    retrieval = await retrieveRankedSources({
      userId: user.id,
      query,
      courseId: courseId ?? null,
      limit: 8,
    });
  } catch (error) {
    console.error("[notes/search] Retrieval failed:", error);
    return NextResponse.json({ error: "Note search failed." }, { status: 500 });
  }

  return NextResponse.json({
    results: retrieval.ranked.map((r) => ({
      id: r.chunk.id,
      title: r.chunk.title,
      content: r.chunk.text.slice(0, 2000),
      course_id: r.chunk.courseId,
      similarity: r.signals.semanticSimilarity,
      source: r.chunk.sourceType,
      confidence: r.confidence,
      reasons: r.reasons,
      source_url: r.chunk.sourceUrl ?? null,
    })),
    confidence: retrieval.confidence,
  });
}
