import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { getActiveCourseIds, retainActiveCourseRows } from "@/backend/lms/activeCourses";

/** Returns completed practice sessions from active courses (last 60 days). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data, error }, activeCourseIds] = await Promise.all([supabase
    .from("practice_sessions")
    .select("id, created_at, course_id, topic, difficulty, question_count, correct_count, status, course:courses(name, color)")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .gte("created_at", since)
    .order("created_at", { ascending: false }), getActiveCourseIds(supabase, user.id)]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(retainActiveCourseRows(data ?? [], activeCourseIds));
}
