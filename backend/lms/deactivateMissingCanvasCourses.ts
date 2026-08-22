import type { SupabaseClient } from "@supabase/supabase-js";

type DeactivateMissingCanvasCoursesOptions = {
  userId: string;
  connectionId: string;
  activePlatformIds: Array<string | number>;
};

/**
 * Marks cached Canvas courses inactive when Canvas no longer returns them as
 * active. The empty-list case intentionally updates every course belonging to
 * the connection; this is how a fully completed term is reconciled.
 */
export async function deactivateMissingCanvasCourses(
  supabase: SupabaseClient,
  { userId, connectionId, activePlatformIds }: DeactivateMissingCanvasCoursesOptions
): Promise<{ message: string } | null> {
  let query = supabase
    .from("courses")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("platform", "canvas")
    .eq("connection_id", connectionId);

  if (activePlatformIds.length > 0) {
    query = query.not("platform_id", "in", `(${activePlatformIds.join(",")})`);
  }

  const { error } = await query;
  return error;
}
