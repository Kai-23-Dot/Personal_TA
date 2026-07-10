/**
 * GET    /api/groups/[id]  → group detail: members, shared decks, schedule, health
 * PATCH  /api/groups/[id]  → owner updates goal progress / marks goal complete
 * DELETE /api/groups/[id]  → leave (member) or delete (owner)
 *
 * Uses admin client for all group_members queries to bypass recursive RLS.
 */
import { createClient, createServiceClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import { toUtcDateString } from "@/backend/groups/validation";
import { computeMemberStreaks } from "@/backend/groups/health";
import { deriveGroupSignals, toCheckinInputs } from "@/backend/groups/mappers";

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

  const now = new Date();
  const checkinFloor = toUtcDateString(new Date(now.getTime() - 28 * 86_400_000));

  const [groupRes, membersRes, notesRes, flashcardsRes, meetingsRes, checkinsRes] = await Promise.all([
    admin.from("study_groups").select("*, course:courses(id, name)").eq("id", id).single(),
    admin.from("group_members").select("user_id, role, joined_at, profile:profiles(full_name, avatar_url)").eq("group_id", id),
    admin.from("group_shared_notes").select("id, note_id, shared_by, shared_at, note:notes(title, file_type, word_count)").eq("group_id", id).order("shared_at", { ascending: false }).limit(20),
    admin.from("group_shared_flashcards").select("*").eq("group_id", id).order("shared_at", { ascending: false }),
    admin.from("group_meetings").select("id, day_of_week, start_time, frequency, created_at").eq("group_id", id).order("day_of_week").order("start_time"),
    admin.from("group_checkins").select("user_id, checkin_date").eq("group_id", id).gte("checkin_date", checkinFloor),
  ]);

  const group = groupRes.data;
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const members  = membersRes.data ?? [];
  const meetings = meetingsRes.data ?? [];
  const checkins = checkinsRes.data ?? [];
  const today    = toUtcDateString(now);

  const { health, goalStatus, nextMeetingAt } = deriveGroupSignals(
    group, meetings, checkins, members.length, now
  );

  return NextResponse.json({
    group,
    members,
    sharedNotes:      notesRes.data ?? [],
    sharedFlashcards: flashcardsRes.data ?? [],
    myRole:           membership.role,
    meetings,
    health,
    goalStatus,
    nextMeetingAt,
    checkedInToday:   checkins.some((c) => c.user_id === user.id && c.checkin_date === today),
    checkinsToday:    checkins.filter((c) => c.checkin_date === today).map((c) => c.user_id),
    memberStreaks:    computeMemberStreaks(toCheckinInputs(checkins), now),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  if (membership.role !== "owner") {
    return NextResponse.json({ error: "Only the group owner can update the goal" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const progressPct  = body?.progressPct;
  const markComplete = body?.markComplete === true;

  const { data: group } = await admin.from("study_groups").select("*").eq("id", id).single();
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const update: Record<string, unknown> = {};

  if (progressPct !== undefined) {
    if (typeof progressPct !== "number" || !Number.isInteger(progressPct) || progressPct < 0 || progressPct > 100) {
      return NextResponse.json({ error: "progressPct must be an integer from 0 to 100" }, { status: 400 });
    }
    update.progress_pct = progressPct;
  }

  if (markComplete) {
    if (!group.goal) {
      return NextResponse.json({ error: "This group has no goal to complete" }, { status: 400 });
    }
    // Idempotent: completing an already-completed goal keeps the original timestamp.
    if (!group.goal_completed_at) update.goal_completed_at = new Date().toISOString();
  }

  if (Object.keys(update).length === 0 && !markComplete) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  let updated = group;
  if (Object.keys(update).length > 0) {
    const { data, error } = await admin
      .from("study_groups")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
    }
    updated = data;
  }

  // Recompute health so the client can update in place without a refetch.
  const now = new Date();
  const checkinFloor = toUtcDateString(new Date(now.getTime() - 28 * 86_400_000));
  const [meetingsRes, checkinsRes, countRes] = await Promise.all([
    admin.from("group_meetings").select("group_id, day_of_week, start_time, frequency, created_at").eq("group_id", id),
    admin.from("group_checkins").select("user_id, checkin_date").eq("group_id", id).gte("checkin_date", checkinFloor),
    admin.from("group_members").select("group_id").eq("group_id", id),
  ]);
  const { health, goalStatus } = deriveGroupSignals(
    updated, meetingsRes.data ?? [], checkinsRes.data ?? [], (countRes.data ?? []).length, now
  );

  return NextResponse.json({ success: true, group: updated, health, goalStatus });
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
