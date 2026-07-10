/**
 * POST /api/groups/[id]/checkins → one-tap "I studied today" check-in.
 *
 * Idempotent per (group, user, UTC day) via the table's unique constraint —
 * tapping twice is safe and reports alreadyCheckedIn. The check-in date is
 * always computed server-side; clients cannot back- or forward-date.
 */
import { createClient, createServiceClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import { toUtcDateString } from "@/backend/groups/validation";
import { computeMemberStreaks } from "@/backend/groups/health";
import { deriveGroupSignals, toCheckinInputs } from "@/backend/groups/mappers";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const today = toUtcDateString(now);

  const { data: existing } = await admin
    .from("group_checkins")
    .select("id")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .eq("checkin_date", today)
    .maybeSingle();

  const alreadyCheckedIn = Boolean(existing);
  if (!alreadyCheckedIn) {
    const { error } = await admin.from("group_checkins").insert({
      group_id:     id,
      user_id:      user.id,
      checkin_date: today,
    });
    // A unique-violation race with another tab is equivalent to already checked in.
    if (error && error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Return updated health so the UI reflects the check-in without a refetch.
  const checkinFloor = toUtcDateString(new Date(now.getTime() - 28 * 86_400_000));
  const [groupRes, meetingsRes, checkinsRes, countRes] = await Promise.all([
    admin.from("study_groups").select("*").eq("id", id).single(),
    admin.from("group_meetings").select("group_id, day_of_week, start_time, frequency, created_at").eq("group_id", id),
    admin.from("group_checkins").select("user_id, checkin_date").eq("group_id", id).gte("checkin_date", checkinFloor),
    admin.from("group_members").select("group_id").eq("group_id", id),
  ]);

  if (!groupRes.data) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const checkins = checkinsRes.data ?? [];
  const { health } = deriveGroupSignals(
    groupRes.data, meetingsRes.data ?? [], checkins, (countRes.data ?? []).length, now
  );
  const streaks = computeMemberStreaks(toCheckinInputs(checkins), now);

  return NextResponse.json({
    success: true,
    alreadyCheckedIn,
    health,
    userId: user.id,
    streak: streaks[user.id] ?? 1,
    checkinsToday: checkins.filter((c) => c.checkin_date === today).map((c) => c.user_id),
  });
}
