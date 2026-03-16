import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCanvasFiles } from "@/lib/lms/canvas";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "courseId required" }, { status: 400 });

  const { data: course } = await supabase
    .from("courses")
    .select("id, platform, platform_id")
    .eq("id", courseId)
    .eq("user_id", user.id)
    .single();

  if (!course || course.platform !== "canvas" || !course.platform_id) {
    return NextResponse.json({ error: "Course not linked to Canvas" }, { status: 400 });
  }

  const { data: connection } = await supabase
    .from("lms_connections")
    .select("access_token, canvas_domain")
    .eq("user_id", user.id)
    .eq("platform", "canvas")
    .eq("is_active", true)
    .single();

  if (!connection?.access_token || !connection?.canvas_domain) {
    return NextResponse.json({ error: "Canvas connection missing" }, { status: 400 });
  }

  const files = await fetchCanvasFiles(
    connection.canvas_domain,
    connection.access_token,
    Number(course.platform_id),
    50
  );

  const pptFiles = files.filter((file) =>
    file["content-type"]?.includes("presentation") ||
    file.filename?.toLowerCase().endsWith(".pptx")
  );

  const sorted = [...pptFiles].sort((a, b) => {
    const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return bTime - aTime;
  });

  return NextResponse.json(
    sorted.map((file) => ({
      id: file.id,
      display_name: file.display_name,
      filename: file.filename,
      content_type: file["content-type"],
      size: file.size,
      updated_at: file.updated_at,
      url: file.url,
    }))
  );
}
