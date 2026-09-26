import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { WEAK_THRESHOLD_PCT } from "@/backend/study/mastery";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // This endpoint feeds a panel headed "Topics where your practice accuracy is
  // below 70%". It used to return the lowest five whatever they scored, so a
  // student with few topics saw mastered ones listed as weak.
  const { data, error } = await supabase
    .from("performance_metrics")
    .select("topic, accuracy_pct")
    .eq("user_id", user.id)
    .lt("accuracy_pct", WEAK_THRESHOLD_PCT)
    .order("accuracy_pct", { ascending: true })
    .limit(5);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
