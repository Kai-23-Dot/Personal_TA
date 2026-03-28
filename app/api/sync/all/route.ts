import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { POST as syncPost } from "@/app/api/sync/route";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: connections } = await supabase
    .from("lms_connections")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (!connections || connections.length === 0) {
    return NextResponse.json({ success: true, courses: 0, assignments: 0, notes: 0, errors: [] });
  }

  let totals = { courses: 0, assignments: 0, notes: 0 };
  const errors: string[] = [];

  for (const conn of connections) {
    const res = await syncPost(
      new Request(req.url.replace("/sync/all", "/sync"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: conn.id }),
      })
    );
    const data = await res.json();
    if (!res.ok || data?.success === false) {
      errors.push(data?.error || "Sync failed");
      continue;
    }
    totals.courses += data.courses ?? 0;
    totals.assignments += data.assignments ?? 0;
    totals.notes += data.notes ?? 0;
    if (Array.isArray(data.errors)) {
      errors.push(...data.errors);
    }
  }

  return NextResponse.json({ success: true, ...totals, errors });
}
