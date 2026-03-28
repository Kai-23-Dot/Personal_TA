import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { retrieveRelevantContext } from "@/lib/utils/rag";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { query, courseId } = body as { query: string; courseId?: string | null };

  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  const results = await retrieveRelevantContext(user.id, query, 6);
  const filtered = courseId
    ? results.filter((r) => r.course_id === courseId)
    : results;

  return NextResponse.json({ results: filtered });
}
