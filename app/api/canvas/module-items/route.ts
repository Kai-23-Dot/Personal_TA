import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCanvasModules, fetchCanvasModuleItems, fetchCanvasFilesWide, fetchCanvasPages, fetchCanvasAssignments } from "@/lib/lms/canvas";

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

  const modules = await fetchCanvasModules(connection.canvas_domain, connection.access_token, Number(course.platform_id));

  const items = await Promise.all(
    modules.map(async (module) => {
      const moduleItems = await fetchCanvasModuleItems(
        connection.canvas_domain,
        connection.access_token,
        Number(course.platform_id),
        module.id
      );
      return moduleItems.map((item) => ({
        moduleId: module.id,
        moduleName: module.name,
        itemId: item.id,
        title: item.title,
        type: item.type,
        page_url: item.page_url ?? null,
        external_url: item.external_url ?? null,
        content_id: item.content_id ?? null,
        content_details: item.content_details ?? null,
      }));
    })
  );

  const flattened = items.flat();
  const files = await fetchCanvasFilesWide(
    connection.canvas_domain,
    connection.access_token,
    Number(course.platform_id),
    100
  );
  const [pages, assignments] = await Promise.all([
    fetchCanvasPages(connection.canvas_domain, connection.access_token, Number(course.platform_id)),
    fetchCanvasAssignments(connection.canvas_domain, connection.access_token, Number(course.platform_id)),
  ]);

  const fileBackfill = files.map((file) => ({
    moduleId: 0,
    moduleName: "Course Files",
    itemId: file.id,
    title: file.display_name || file.filename,
    type: "File",
    page_url: null,
    external_url: null,
    content_id: file.id,
    content_details: {
      "content-type": file["content-type"] ?? file.content_type,
      url: file.url,
    },
  }));
  const pageBackfill = pages.map((page) => ({
    moduleId: -1,
    moduleName: "Course Pages",
    itemId: page.page_id,
    title: page.title,
    type: "Page",
    page_url: page.url ?? null,
    external_url: null,
    content_id: null,
    content_details: null,
  }));
  const assignmentBackfill = assignments.map((a) => ({
    moduleId: -2,
    moduleName: "Assignments",
    itemId: a.id,
    title: a.name,
    type: "Assignment",
    page_url: null,
    external_url: null,
    content_id: a.id,
    content_details: null,
  }));

  // Merge and de-duplicate File entries by content_id.
  const seen = new Set<string>();
  const merged = [...flattened, ...fileBackfill, ...pageBackfill, ...assignmentBackfill].filter((item) => {
    const key = `${item.type}:${item.content_id ?? item.itemId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json(merged);
}
