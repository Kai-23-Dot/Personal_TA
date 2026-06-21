import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { fetchCanvasFiles } from "@/backend/lms/canvas";
import { extractFileText, mimeToFileType } from "@/backend/utils/extractFileText";

export const maxDuration = 90;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { courseId, maxFiles = 20 } = body as { courseId: string; maxFiles?: number };
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
      Math.min(Math.max(maxFiles, 1), 50)
    );

    const pptFiles = files.filter((file) =>
      file["content-type"]?.includes("presentation") ||
      file.filename?.toLowerCase().endsWith(".pptx")
    );

    if (pptFiles.length === 0) {
      return NextResponse.json({ success: true, imported: 0, skipped: 0 });
    }

    const sourceIds = pptFiles.map((file) => `canvas_file_${course.platform_id}_${file.id}`);
    const { data: existingNotes } = await supabase
      .from("notes")
      .select("source_file_id")
      .eq("user_id", user.id)
      .in("source_file_id", sourceIds);

    const existingSet = new Set((existingNotes ?? []).map((n) => n.source_file_id));
    let imported = 0;
    let skipped = 0;

    for (const file of pptFiles) {
      const sourceFileId = `canvas_file_${course.platform_id}_${file.id}`;
      if (existingSet.has(sourceFileId)) {
        skipped++;
        continue;
      }

      let downloadUrl = file.url;
      let contentType = file["content-type"] || file.content_type || "";

      if (!downloadUrl) {
        const detailRes = await fetch(`https://${connection.canvas_domain}/api/v1/files/${file.id}`, {
          headers: { Authorization: `Bearer ${connection.access_token}` },
        });
        if (!detailRes.ok) continue;
        const detail = await detailRes.json();
        downloadUrl = detail?.url;
        contentType = detail?.["content-type"] || detail?.content_type || contentType;
      }

      if (!downloadUrl) continue;

      const fileType = mimeToFileType(contentType);
      if (fileType !== "pptx") continue;

      const downloadRes = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${connection.access_token}` },
      });
      if (!downloadRes.ok) continue;

      const buffer = Buffer.from(await downloadRes.arrayBuffer());
      const content = await extractFileText(buffer, fileType);
      if (!content) continue;

      const { error } = await supabase
        .from("notes")
        .insert({
          user_id: user.id,
          course_id: course.id,
          title: file.display_name || file.filename || "Canvas PowerPoint",
          content,
          source_type: "canvas",
          source_file_id: sourceFileId,
          source_url: downloadUrl,
          file_name: file.filename ?? null,
          file_type: "pptx",
          file_size_bytes: file.size ?? null,
          is_processed: true,
        });

      if (!error) imported++;
    }

    return NextResponse.json({ success: true, imported, skipped });
  } catch (err) {
    console.error("[/api/notes/sync-canvas-powerpoints] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
