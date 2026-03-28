import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function toICSDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabase
    .from("study_blocks")
    .select("*")
    .eq("user_id", user.id)
    .order("start_time", { ascending: true });

  if (from) query = query.gte("start_time", from);
  if (to) query = query.lte("start_time", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const events = (data ?? []).map((block) => {
    const start = new Date(block.start_time);
    const end = new Date(block.end_time);
    return [
      "BEGIN:VEVENT",
      `UID:${block.id}`,
      `DTSTAMP:${toICSDate(new Date())}`,
      `DTSTART:${toICSDate(start)}`,
      `DTEND:${toICSDate(end)}`,
      `SUMMARY:${block.title}`,
      "END:VEVENT",
    ].join("\n");
  });

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PersonalTA//Study Planner//EN",
    ...events,
    "END:VCALENDAR",
  ].join("\n");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "attachment; filename=personalta-study-plan.ics",
    },
  });
}
