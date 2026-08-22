import type { SupabaseClient } from "@supabase/supabase-js";

export type CanvasCourseContext = {
  connection: {
    access_token: string;
    canvas_domain: string;
    id: string;
  };
  course: {
    id: string;
    name: string | null;
    platform_id: string;
  };
};

/**
 * Resolve the Canvas credentials attached to a specific course. This avoids
 * accidentally using another active Canvas account when a user has more than one.
 */
export async function getCanvasCourseContext(
  supabase: SupabaseClient,
  userId: string,
  courseId: string
): Promise<CanvasCourseContext | null> {
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, name, platform, platform_id, connection_id")
    .eq("id", courseId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (
    courseError ||
    !course ||
    course.platform !== "canvas" ||
    !course.platform_id
  ) {
    return null;
  }

  let connectionQuery = supabase
    .from("lms_connections")
    .select("id, access_token, canvas_domain")
    .eq("user_id", userId)
    .eq("platform", "canvas")
    .eq("is_active", true);

  if (course.connection_id) {
    connectionQuery = connectionQuery.eq("id", course.connection_id);
  }

  const { data: connections, error: connectionError } =
    await connectionQuery.limit(2);
  if (
    connectionError ||
    !connections ||
    connections.length !== 1 ||
    !connections[0].access_token ||
    !connections[0].canvas_domain
  ) {
    return null;
  }

  return {
    course: {
      id: course.id,
      name: course.name,
      platform_id: course.platform_id,
    },
    connection: {
      id: connections[0].id,
      access_token: connections[0].access_token,
      canvas_domain: connections[0].canvas_domain,
    },
  };
}
