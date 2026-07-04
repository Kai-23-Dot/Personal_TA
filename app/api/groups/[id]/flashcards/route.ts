/**
 * GET  /api/groups/[id]/flashcards  → list shared flashcard decks for this group
 * POST /api/groups/[id]/flashcards  → share a flashcard deck with the group
 */
import { createClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Membership check
  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .single();
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const { data, error } = await supabase
    .from("group_shared_flashcards")
    .select("*, course:courses(name)")
    .eq("group_id", id)
    .order("shared_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ decks: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Membership check
  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .single();
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const { name, flashcardIds, courseId, chapter } = await req.json();

  if (!name?.trim() || !Array.isArray(flashcardIds) || flashcardIds.length === 0) {
    return NextResponse.json({ error: "name and flashcardIds are required" }, { status: 400 });
  }

  // Verify all flashcard IDs belong to this user
  const { data: cards } = await supabase
    .from("flashcards")
    .select("id")
    .in("id", flashcardIds)
    .eq("user_id", user.id);

  const verifiedIds = (cards ?? []).map((c) => c.id);
  if (verifiedIds.length === 0) {
    return NextResponse.json({ error: "No valid flashcards found" }, { status: 400 });
  }

  const { data: deck, error } = await supabase
    .from("group_shared_flashcards")
    .insert({
      group_id: id,
      name: name.trim(),
      flashcard_ids: verifiedIds,
      shared_by: user.id,
      course_id: courseId ?? null,
      chapter: chapter?.trim() ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, deck });
}
