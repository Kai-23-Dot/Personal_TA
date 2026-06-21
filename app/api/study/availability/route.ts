import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("study_availability")
    .select("*")
    .eq("user_id", user.id)
    .order("day_of_week", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { day_of_week, start_time, end_time, preferred_block_minutes } = body as {
    day_of_week: number;
    start_time: string;
    end_time: string;
    preferred_block_minutes?: number;
  };

  if (day_of_week === undefined || !start_time || !end_time) {
    return NextResponse.json({ error: "day_of_week, start_time, end_time required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("study_availability")
    .insert({
      user_id: user.id,
      day_of_week,
      start_time,
      end_time,
      preferred_block_minutes: preferred_block_minutes ?? 45,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, availability: data });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("study_availability")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
