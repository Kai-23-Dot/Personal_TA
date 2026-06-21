import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("performance_metrics")
    .select("topic, accuracy_pct")
    .eq("user_id", user.id)
    .order("accuracy_pct", { ascending: true })
    .limit(5);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
