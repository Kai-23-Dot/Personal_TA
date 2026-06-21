import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const [{ data: plan }, { data: blocks }] = await Promise.all([
    supabase
      .from("study_plans")
      .select("*")
      .eq("user_id", user.id)
      .eq("plan_date", date)
      .maybeSingle(),
    supabase
      .from("study_blocks")
      .select("*")
      .eq("user_id", user.id)
      .eq("plan_date", date)
      .order("start_time", { ascending: true }),
  ]);

  return NextResponse.json({ plan: plan ?? null, blocks: blocks ?? [] });
}
