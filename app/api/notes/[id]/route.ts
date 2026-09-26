/**
 * DELETE /api/notes/[id] → remove a note and the file it was made from
 *
 * Used when a student takes a source back out of a notebook. RLS already scopes
 * notes to their owner; the explicit user_id filter is belt and braces on a
 * destructive path.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Read the storage path first: once the row is gone there is no way to find
  // the object it referenced, and it would sit in the bucket forever.
  const { data: note } = await supabase
    .from("notes")
    .select("id, storage_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[notes] Delete failed:", error);
    return NextResponse.json({ error: "Could not remove that source." }, { status: 500 });
  }

  // A file left behind costs storage but breaks nothing, so a failure here is
  // logged rather than surfaced — the note is already gone and the student's
  // action succeeded.
  if (note.storage_path) {
    const { error: storageError } = await supabase.storage
      .from("notes")
      .remove([note.storage_path]);
    if (storageError) {
      console.warn("[notes] Orphaned stored file:", note.storage_path, storageError);
    }
  }

  return NextResponse.json({ ok: true });
}
