/**
 * Study Groups API
 * POST /api/groups        → Create a group
 * GET  /api/groups        → List groups the user belongs to
 * POST /api/groups/join   → Join via invite code
 */
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch all groups the user is a member of
  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);

  const groupIds = (memberships ?? []).map((m) => m.group_id);

  if (groupIds.length === 0) {
    return NextResponse.json({ groups: [] });
  }

  const { data: groups } = await supabase
    .from("study_groups")
    .select("*, course:courses(name)")
    .in("id", groupIds)
    .order("created_at", { ascending: false });

  // Attach member counts
  const { data: counts } = await supabase
    .from("group_members")
    .select("group_id")
    .in("group_id", groupIds);

  const countMap: Record<string, number> = {};
  (counts ?? []).forEach((c) => {
    countMap[c.group_id] = (countMap[c.group_id] ?? 0) + 1;
  });

  return NextResponse.json({
    groups: (groups ?? []).map((g) => ({ ...g, member_count: countMap[g.id] ?? 0 })),
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description, courseId } = await req.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: "Group name is required" }, { status: 400 });
  }

  // Create group
  const { data: group, error: groupError } = await supabase
    .from("study_groups")
    .insert({
      owner_id: user.id,
      name: name.trim(),
      description: description?.trim() ?? null,
      course_id: courseId ?? null,
    })
    .select()
    .single();

  if (groupError || !group) {
    return NextResponse.json({ error: groupError?.message ?? "Failed to create group" }, { status: 500 });
  }

  // Add creator as owner member
  await supabase.from("group_members").insert({
    group_id: group.id,
    user_id: user.id,
    role: "owner",
  });

  return NextResponse.json({ success: true, group });
}
