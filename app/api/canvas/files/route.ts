import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { fetchCanvasFiles } from "@/backend/lms/canvas";
import { getCanvasCourseContext } from "@/backend/lms/canvasConnection";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "courseId required" }, { status: 400 });

  const context = await getCanvasCourseContext(supabase, user.id, courseId);
  if (!context) {
    return NextResponse.json({ error: "Course not linked to Canvas" }, { status: 400 });
  }
  const { connection, course } = context;

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
