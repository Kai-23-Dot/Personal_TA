import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";

/** Returns the started_at timestamps of completed practice sessions (last 60 days). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("practice_sessions")
    .select("created_at")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
