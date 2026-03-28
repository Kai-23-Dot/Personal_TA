import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabase
    .from("study_blocks")
    .select("*")
    .eq("user_id", user.id)
    .order("start_time", { ascending: true });

  if (from) query = query.gte("start_time", from);
  if (to) query = query.lte("start_time", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { plan_date, title, task_type, start_time, end_time, assignment_id, course_id, notes } = body as {
    plan_date: string;
    title: string;
    task_type?: string;
    start_time: string;
    end_time: string;
    assignment_id?: string | null;
    course_id?: string | null;
    notes?: string | null;
  };

  if (!plan_date || !title || !start_time || !end_time) {
    return NextResponse.json({ error: "plan_date, title, start_time, end_time required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("study_blocks")
    .insert({
      user_id: user.id,
      plan_date,
      title,
      task_type: task_type ?? "study",
      start_time,
      end_time,
      assignment_id: assignment_id ?? null,
      course_id: course_id ?? null,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, block: data });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const allowed = ["title", "task_type", "start_time", "end_time", "status", "notes"];
  const updatePayload: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in updates) updatePayload[key] = updates[key];
  }

  const { data, error } = await supabase
    .from("study_blocks")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, block: data });
}
