/**
 * GET /api/notes/topic-content?courseId=...&topic=...
 *
 * Uses canvasDeepFetch to retrieve all Canvas content relevant to a topic,
 * including live-fetched Canvas pages not yet synced to the database.
 * Used by the Notes and Flashcards sections to surface the right material.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canvasDeepFetch } from "@/lib/canvas-intelligence/canvasDeepFetch";

export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const courseId = searchParams.get("courseId");
    const topic = searchParams.get("topic");
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 20) : 12;

    if (!courseId) return NextResponse.json({ error: "courseId required" }, { status: 400 });
    if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 });

    const result = await canvasDeepFetch({
      userId: user.id,
      courseId,
      topic,
      limit,
    });

    return NextResponse.json({
      success: true,
      hasDirectContent: result.hasDirectContent,
      moduleNames: result.moduleNames,
      sources: result.ranked.map((r) => ({
        title: r.chunk.title,
        text: r.chunk.text.slice(0, 2000),
        moduleName: r.chunk.moduleName,
        sourceUrl: r.chunk.sourceUrl,
        confidence: r.confidence,
        score: r.score,
        reasons: r.reasons,
      })),
    });
  } catch (err) {
    console.error("[/api/notes/topic-content]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
