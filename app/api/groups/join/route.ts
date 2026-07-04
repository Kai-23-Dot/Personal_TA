import { createClient, createServiceClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const admin    = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { inviteCode } = await req.json();
  if (!inviteCode?.trim()) return NextResponse.json({ error: "Invite code is required" }, { status: 400 });

  const { data: group } = await admin
    .from("study_groups")
    .select("id, name, max_members")
    .eq("invite_code", inviteCode.trim().toUpperCase())
    .single();

  if (!group) return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });

  // Use admin client to avoid recursive RLS on group_members
  const { count } = await admin
    .from("group_members")
    .select("id", { count: "exact", head: true })
    .eq("group_id", group.id);

  if ((count ?? 0) >= group.max_members) {
    return NextResponse.json({ error: "Group is full" }, { status: 409 });
  }

  const { data: existing } = await admin
    .from("group_members")
    .select("id")
    .eq("group_id", group.id)
    .eq("user_id", user.id)
    .single();

  if (existing) return NextResponse.json({ success: true, group, alreadyMember: true });

  const { error } = await admin.from("group_members").insert({
    group_id: group.id,
    user_id:  user.id,
    role:     "member",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, group });
}
