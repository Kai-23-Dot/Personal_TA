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

  const { data: syncedNotes } = await supabase
    .from("notes")
    .select("id, title, file_type, source_file_id, source_url, updated_at")
    .eq("user_id", user.id)
    .eq("course_id", course.id)
    .not("content", "is", null)
    .order("updated_at", { ascending: false })
    .limit(500);

  const noteBackfill = (syncedNotes ?? []).map((n) => ({
    itemKey: `SyncedNote:${n.id}`,
    moduleId: -3,
    moduleName: "Synced Notes",
    itemId: 0,
    title: n.title,
    type: "SyncedNote",
    page_url: null,
    external_url: n.source_url ?? null,
    content_id: null,
    content_details: { "content-type": n.file_type ?? "other", url: n.source_url ?? undefined },
    note_id: n.id,
    source_file_id: n.source_file_id ?? null,
  }));

  const { data: connection } = await supabase
    .from("lms_connections")
    .select("access_token, canvas_domain")
    .eq("user_id", user.id)
    .eq("platform", "canvas")
    .eq("is_active", true)
    .single();

  if (!connection?.access_token || !connection?.canvas_domain) {
    return NextResponse.json(noteBackfill);
  }

  const canvasCourseId = Number(course.platform_id);
  if (!Number.isFinite(canvasCourseId)) {
    return NextResponse.json({ error: "Invalid Canvas course ID on this course record. Re-sync courses." }, { status: 400 });
  }

  const modules = await fetchCanvasModules(connection.canvas_domain, connection.access_token, canvasCourseId);

  const items = await Promise.all(
    modules.map(async (module) => {
      const moduleItems = await fetchCanvasModuleItems(
        connection.canvas_domain,
        connection.access_token,
        canvasCourseId,
        module.id
      );
      return moduleItems.map((item) => ({
        itemKey: `ModuleItem:${item.id}`,
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
    canvasCourseId,
    1000
  );
  const [pages, assignments] = await Promise.all([
    fetchCanvasPages(connection.canvas_domain, connection.access_token, canvasCourseId),
    fetchCanvasAssignments(connection.canvas_domain, connection.access_token, canvasCourseId),
  ]);

  const fileBackfill = files.map((file) => ({
    itemKey: `File:${file.id}`,
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
    itemKey: `Page:${page.page_id}`,
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
    itemKey: `Assignment:${a.id}`,
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

  // Merge and de-duplicate Canvas entries by stable content identity.
  const seen = new Set<string>();
  const merged = [...flattened, ...fileBackfill, ...pageBackfill, ...assignmentBackfill, ...noteBackfill].filter((item) => {
    if (item.type === "SyncedNote") return true;
    const key = `${item.type}:${item.content_id ?? item.itemId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json(merged);
}
