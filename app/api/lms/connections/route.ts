import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { z } from "zod";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("lms_connections")
    .select("id, platform, canvas_domain, last_synced_at, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[lms/connections] List failed:", error);
    return NextResponse.json({ error: "Failed to load LMS connections." }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

/**
 * DELETE /api/lms/connections?id=<connectionId>
 * Soft-deletes the connection and marks its synced courses inactive.
 */
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "A valid connection id is required." }, { status: 400 });
  }

  const { error } = await supabase.rpc("disconnect_lms_connection", {
    disconnect_user_id: user.id,
    disconnect_connection_id: parsedId.data,
  });

  if (error) {
    console.error("[lms/connections] Disconnect failed:", error);
    return NextResponse.json({ error: "Failed to disconnect LMS." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
