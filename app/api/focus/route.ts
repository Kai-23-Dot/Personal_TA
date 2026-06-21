import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { studyBlockId } = body as { studyBlockId?: string | null };

  const { data, error } = await supabase
    .from("focus_sessions")
    .insert({
      user_id: user.id,
      study_block_id: studyBlockId ?? null,
      status: "active",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, session: data });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { sessionId, status } = body as { sessionId: string; status?: "completed" | "cancelled" };
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  const endedAt = new Date();

  const { data: existing } = await supabase
    .from("focus_sessions")
    .select("started_at")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  const startedAt = existing?.started_at ? new Date(existing.started_at) : endedAt;
  const durationMinutes = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));

  const { data, error } = await supabase
    .from("focus_sessions")
    .update({
      ended_at: endedAt.toISOString(),
      duration_minutes: durationMinutes,
      status: status ?? "completed",
    })
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, session: data });
}
