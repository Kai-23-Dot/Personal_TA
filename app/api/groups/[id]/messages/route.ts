/**
 * GET  /api/groups/[id]/messages  → fetch recent messages (latest 50)
 * POST /api/groups/[id]/messages  → send a message
 */
import { createClient, createServiceClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";

async function verifyMember(admin: ReturnType<typeof createServiceClient>, groupId: string, userId: string) {
  const { data } = await admin
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .single();
  return data;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin    = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await verifyMember(admin, id, user.id);
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const { data: messages, error } = await admin
    .from("group_messages")
    .select("id, content, message_type, created_at, user_id, profile:profiles(full_name, avatar_url)")
    .eq("group_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return in chronological order for the UI
  return NextResponse.json({ messages: (messages ?? []).reverse() });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin    = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await verifyMember(admin, id, user.id);
  if (!membership) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });

  const { data: message, error } = await admin
    .from("group_messages")
    .insert({
      group_id:     id,
      user_id:      user.id,
      content:      content.trim(),
      message_type: "text",
    })
    .select("id, content, message_type, created_at, user_id, profile:profiles(full_name, avatar_url)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message });
}
