import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";

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

  const totals = { courses: 0, assignments: 0, notes: 0 };
  const errors: string[] = [];
  const mode = new URL(req.url).searchParams.get("mode") === "quick" ? "quick" : "full";
  const cookie = req.headers.get("cookie");

  for (const conn of connections) {
    try {
      // Use a real authenticated request. Calling the route function directly
      // creates a second Supabase server client without a reliable request
      // cookie context on Vercel, which caused valid Canvas connections to be
      // reported as failed.
      const response = await fetch(new URL("/api/sync", req.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({ connectionId: conn.id, mode }),
        cache: "no-store",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result) {
        errors.push(result?.error ?? "An LMS connection could not be synced. Try reconnecting it in Settings.");
        continue;
      }
      totals.courses += result.courses ?? 0;
      totals.assignments += result.assignments ?? 0;
      totals.notes += result.notes ?? 0;
      if (Array.isArray(result.errors)) errors.push(...result.errors);
    } catch (error) {
      console.error(`[sync/all] Connection ${conn.id} failed:`, error);
      errors.push("An LMS connection could not be synced. Try reconnecting it in Settings.");
    }
  }

  const response = {
    success: errors.length === 0,
    partial: errors.length > 0,
    ...totals,
    errors,
    error: errors[0] ?? null,
  };
  const importedAnything = totals.courses > 0 || totals.assignments > 0 || totals.notes > 0;
  return NextResponse.json(response, { status: errors.length === 0 ? 200 : importedAnything ? 207 : 502 });
}
