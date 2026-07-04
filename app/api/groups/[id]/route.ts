/**
 * GET    /api/groups/[id]  → group detail with members + shared flashcard decks
 * DELETE /api/groups/[id]  → leave (member) or delete (owner)
 *
 * Uses admin client for all group_members queries to bypass recursive RLS.
 */
import { createClient, createServiceClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin    = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await admin
    .from("group_members")
    .select("role")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .single();

  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const [groupRes, membersRes, notesRes, flashcardsRes] = await Promise.all([
    admin.from("study_groups").select("*, course:courses(id, name)").eq("id", id).single(),
    admin.from("group_members").select("user_id, role, joined_at, profile:profiles(full_name, avatar_url)").eq("group_id", id),
    admin.from("group_shared_notes").select("id, note_id, shared_by, shared_at, note:notes(title, file_type, word_count)").eq("group_id", id).order("shared_at", { ascending: false }).limit(20),
    admin.from("group_shared_flashcards").select("*").eq("group_id", id).order("shared_at", { ascending: false }),
  ]);

  return NextResponse.json({
    group:            groupRes.data,
    members:          membersRes.data ?? [],
    sharedNotes:      notesRes.data ?? [],
    sharedFlashcards: flashcardsRes.data ?? [],
    myRole:           membership.role,
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin    = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await admin
    .from("group_members")
    .select("role")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .single();

  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  if (membership.role === "owner") {
    await admin.from("study_groups").delete().eq("id", id);
    return NextResponse.json({ success: true, deleted: true });
  }

  await admin.from("group_members").delete().eq("group_id", id).eq("user_id", user.id);
  return NextResponse.json({ success: true, left: true });
}
