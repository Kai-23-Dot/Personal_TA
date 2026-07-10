/**
 * Study Groups API
 * POST /api/groups  → Create a goal-bound group (goal + target date + ≥1 meeting slot required)
 * GET  /api/groups  → List groups the user belongs to, each with live health signals
 *
 * All group_members reads/writes use the service-role client to bypass
 * the RLS infinite-recursion bug on the group_members table.
 */
import { createClient, createServiceClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import { validateCreateGroup, toUtcDateString } from "@/backend/groups/validation";
import { deriveGroupSignals, type CheckinRow, type MeetingRow } from "@/backend/groups/mappers";

export async function GET() {
  const supabase = await createClient();
  const admin    = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: memberships } = await admin
    .from("group_members")
    .select("group_id, role")
    .eq("user_id", user.id);

  const groupIds = (memberships ?? []).map((m) => m.group_id);
  if (groupIds.length === 0) return NextResponse.json({ groups: [] });

  // Build role lookup
  const roleMap: Record<string, string> = {};
  (memberships ?? []).forEach((m) => { roleMap[m.group_id] = m.role; });

  const now = new Date();
  const checkinFloor = toUtcDateString(new Date(now.getTime() - 28 * 86_400_000));

  // 5 flat queries total, regardless of group count — health inputs are
  // fetched in bulk and bucketed in memory (no N+1).
  const [groupsRes, countsRes, meetingsRes, checkinsRes] = await Promise.all([
    admin
      .from("study_groups")
      .select("*, course:courses(name)")
      .in("id", groupIds)
      .order("created_at", { ascending: false }),
    admin.from("group_members").select("group_id").in("group_id", groupIds),
    admin
      .from("group_meetings")
      .select("group_id, day_of_week, start_time, frequency, created_at")
      .in("group_id", groupIds),
    admin
      .from("group_checkins")
      .select("group_id, user_id, checkin_date")
      .in("group_id", groupIds)
      .gte("checkin_date", checkinFloor),
  ]);

  const countMap: Record<string, number> = {};
  (countsRes.data ?? []).forEach((c) => {
    countMap[c.group_id] = (countMap[c.group_id] ?? 0) + 1;
  });

  const meetingsByGroup: Record<string, MeetingRow[]> = {};
  (meetingsRes.data ?? []).forEach((m) => {
    (meetingsByGroup[m.group_id] ??= []).push(m);
  });

  const checkinsByGroup: Record<string, CheckinRow[]> = {};
  (checkinsRes.data ?? []).forEach((c) => {
    (checkinsByGroup[c.group_id] ??= []).push(c);
  });

  const today = toUtcDateString(now);

  return NextResponse.json({
    groups: (groupsRes.data ?? []).map((g) => {
      const meetings = meetingsByGroup[g.id] ?? [];
      const checkins = checkinsByGroup[g.id] ?? [];
      const { health, goalStatus, nextMeetingAt } = deriveGroupSignals(
        g,
        meetings,
        checkins,
        countMap[g.id] ?? 0,
        now
      );
      return {
        ...g,
        member_count: countMap[g.id] ?? 0,
        my_role: roleMap[g.id] ?? "member",
        health,
        goal_status: goalStatus,
        next_meeting_at: nextMeetingAt,
        checked_in_today: checkins.some(
          (c) => c.user_id === user.id && c.checkin_date === today
        ),
      };
    }),
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const admin    = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const validated = validateCreateGroup(body, new Date());
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const { name, description, courseId, goal, targetEndDate, meetings } = validated.value;

  // Use admin for the entire create+select to avoid the study_groups SELECT
  // policy triggering the recursive group_members RLS check.
  const { data: group, error: groupError } = await admin
    .from("study_groups")
    .insert({
      owner_id:        user.id,
      name,
      description:     description ?? null,
      course_id:       courseId ?? null,
      goal,
      target_end_date: targetEndDate,
      progress_pct:    0,
    })
    .select()
    .single();

  if (groupError || !group) {
    return NextResponse.json({ error: groupError?.message ?? "Failed to create group" }, { status: 500 });
  }

  const { error: memberError } = await admin.from("group_members").insert({
    group_id: group.id,
    user_id:  user.id,
    role:     "owner",
  });

  if (memberError) {
    await admin.from("study_groups").delete().eq("id", group.id);
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  const { error: meetingsError } = await admin.from("group_meetings").insert(
    meetings.map((m) => ({
      group_id:    group.id,
      day_of_week: m.dayOfWeek,
      start_time:  m.startTime,
      frequency:   m.frequency,
    }))
  );

  if (meetingsError) {
    // Cascade cleans up the owner membership too.
    await admin.from("study_groups").delete().eq("id", group.id);
    return NextResponse.json({ error: meetingsError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, group });
}
