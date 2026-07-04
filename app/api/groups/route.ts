/**
 * Study Groups API
 * POST /api/groups  → Create a group
 * GET  /api/groups  → List groups the user belongs to
 *
 * All group_members reads/writes use the service-role client to bypass
 * the RLS infinite-recursion bug on the group_members table.
 */
import { createClient, createServiceClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";

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

  const { data: groups } = await admin
    .from("study_groups")
    .select("*, course:courses(name)")
    .in("id", groupIds)
    .order("created_at", { ascending: false });

  const { data: counts } = await admin
    .from("group_members")
    .select("group_id")
    .in("group_id", groupIds);

  const countMap: Record<string, number> = {};
  (counts ?? []).forEach((c) => {
    countMap[c.group_id] = (countMap[c.group_id] ?? 0) + 1;
  });

  return NextResponse.json({
    groups: (groups ?? []).map((g) => ({
      ...g,
      member_count: countMap[g.id] ?? 0,
      my_role: roleMap[g.id] ?? "member",
    })),
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const admin    = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description, courseId } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Group name is required" }, { status: 400 });

  // Use admin for the entire create+select to avoid the study_groups SELECT
  // policy triggering the recursive group_members RLS check.
  const { data: group, error: groupError } = await admin
    .from("study_groups")
    .insert({
      owner_id:    user.id,
      name:        name.trim(),
      description: description?.trim() ?? null,
      course_id:   courseId ?? null,
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

  return NextResponse.json({ success: true, group });
}
