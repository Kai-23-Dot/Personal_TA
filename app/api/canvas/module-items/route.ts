import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCanvasModules, fetchCanvasModuleItems } from "@/lib/lms/canvas";

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

  return NextResponse.json(flattened);
}
