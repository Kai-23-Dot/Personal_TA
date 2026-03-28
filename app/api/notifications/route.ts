import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  type AssignmentRow = {
    id: string;
    title: string;
    due_date: string | null;
    course: { name: string } | { name: string }[] | null;
  };

  type BlockRow = {
    id: string;
    title: string;
    start_time: string;
  };

  const now = new Date();
  const upcomingAssignmentsCutoff = new Date(now.getTime() + 3 * 86400000).toISOString();
  const upcomingBlocksCutoff = new Date(now.getTime() + 24 * 60 * 60000).toISOString();
  const recentCutoff = new Date(now.getTime() - 7 * 86400000).toISOString();

  const [{ data: existing }, { data: assignments }, { data: blocks }] = await Promise.all([
    supabase
      .from("notifications")
      .select("title")
      .eq("user_id", user.id)
      .gte("created_at", recentCutoff),
    supabase
      .from("assignments")
      .select("id,title,due_date,course:courses(name)")
      .eq("user_id", user.id)
      .eq("is_completed", false)
      .gte("due_date", now.toISOString())
      .lte("due_date", upcomingAssignmentsCutoff)
      .order("due_date", { ascending: true })
      .limit(10),
    supabase
      .from("study_blocks")
      .select("id,title,start_time")
      .eq("user_id", user.id)
      .eq("status", "scheduled")
      .gte("start_time", now.toISOString())
      .lte("start_time", upcomingBlocksCutoff)
      .order("start_time", { ascending: true })
      .limit(10),
  ]);

  const existingTitles = new Set((existing ?? []).map((n) => n.title));
  const inserts: Array<{ user_id: string; title: string; body: string; type: string; scheduled_at?: string }> = [];

  ((assignments as AssignmentRow[] | null) ?? []).forEach((assignment) => {
    const courseName = Array.isArray(assignment.course)
      ? assignment.course[0]?.name
      : assignment.course?.name;
    const due = assignment.due_date ? new Date(assignment.due_date).toLocaleString() : "soon";
    const title = `Due soon: ${assignment.title}`;
    if (!existingTitles.has(title)) {
      inserts.push({
        user_id: user.id,
        title,
        body: `${courseName ?? "Course"} • Due ${due}`,
        type: "reminder",
        scheduled_at: assignment.due_date ?? undefined,
      });
    }
  });

  ((blocks as BlockRow[] | null) ?? []).forEach((block) => {
    const start = new Date(block.start_time).toLocaleString();
    const title = `Upcoming study block: ${block.title}`;
    if (!existingTitles.has(title)) {
      inserts.push({
        user_id: user.id,
        title,
        body: `Starts ${start}`,
        type: "reminder",
        scheduled_at: block.start_time ?? undefined,
      });
    }
  });

  if (inserts.length > 0) {
    await supabase.from("notifications").insert(inserts);
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, read } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: read ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, notification: data });
}
