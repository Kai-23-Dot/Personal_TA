import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { format, subDays } from "date-fns";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = subDays(new Date(), 14).toISOString();

  const { data, error } = await supabase
    .from("quiz_attempts")
    .select("is_correct, created_at")
    .eq("user_id", user.id)
    .gte("created_at", since);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const buckets: Record<string, { total: number; correct: number }> = {};
  (data ?? []).forEach((row) => {
    const day = format(new Date(row.created_at), "yyyy-MM-dd");
    if (!buckets[day]) buckets[day] = { total: 0, correct: 0 };
    buckets[day].total += 1;
    if (row.is_correct) buckets[day].correct += 1;
  });

  const series = Object.entries(buckets).map(([day, stats]) => ({
    day,
    accuracy: stats.total ? Math.round((stats.correct / stats.total) * 100) : 0,
  }));

  return NextResponse.json(series);
}
