import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  const dueOnly = searchParams.get("dueOnly") !== "false";

  let query = supabase
    .from("flashcards")
    .select("*")
    .eq("user_id", user.id)
    .order("next_review", { ascending: true })
    .limit(50);

  if (courseId) query = query.eq("course_id", courseId);
  if (dueOnly) query = query.lte("next_review", new Date().toISOString());

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
