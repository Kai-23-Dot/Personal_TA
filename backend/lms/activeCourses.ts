import type { SupabaseClient } from "@supabase/supabase-js";

export async function getActiveCourseIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("courses")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []).map((course) => course.id);
}

export function retainActiveCourseRows<T extends { course_id: string | null }>(
  rows: T[],
  activeCourseIds: string[]
): T[] {
  const active = new Set(activeCourseIds);
  return rows.filter((row) => row.course_id === null || active.has(row.course_id));
}
