import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { retrieveRankedSources } from "@/backend/canvas-intelligence/hybridRetriever";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { query, courseId } = body as { query: string; courseId?: string | null };

  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  const retrieval = await retrieveRankedSources({
    userId: user.id,
    query,
    courseId: courseId ?? null,
    limit: 8,
  });

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
