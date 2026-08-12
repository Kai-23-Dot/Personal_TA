import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import {
  downloadCanvasFile,
  fetchCanvasFileById,
  fetchCanvasFiles,
} from "@/backend/lms/canvas";
import { extractFileText, detectFileType } from "@/backend/utils/extractFileText";
import { getCanvasCourseContext } from "@/backend/lms/canvasConnection";
import { z } from "zod";

export const maxDuration = 90;
const syncCanvasPowerPointsSchema = z.object({
  courseId: z.string().uuid(),
  maxFiles: z.number().int().min(1).max(50).default(20),
}).strict();
const MAX_POWERPOINT_BYTES = 20 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsedBody = syncCanvasPowerPointsSchema.safeParse(
      await req.json().catch(() => null)
    );
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid PowerPoint sync request." }, { status: 400 });
    }
    const { courseId, maxFiles } = parsedBody.data;

    const context = await getCanvasCourseContext(supabase, user.id, courseId);
    if (!context) {
      return NextResponse.json({ error: "Course not linked to Canvas" }, { status: 400 });
    }
    const { course, connection } = context;

    const files = await fetchCanvasFiles(
      connection.canvas_domain,
      connection.access_token,
      Number(course.platform_id),
      maxFiles
    );

    const pptFiles = files.filter((file) =>
      file["content-type"]?.includes("presentation") ||
      file.filename?.toLowerCase().endsWith(".pptx")
    );

    if (pptFiles.length === 0) {
      return NextResponse.json({ success: true, imported: 0, skipped: 0 });
    }

    const sourceIds = pptFiles.flatMap((file) => [
      `canvas_file_${course.id}_${file.id}`,
      `canvas_file_${course.platform_id}_${file.id}`,
    ]);
    const { data: existingNotes } = await supabase
      .from("notes")
      .select("source_file_id")
      .eq("user_id", user.id)
      .in("source_file_id", sourceIds);

    const existingSet = new Set((existingNotes ?? []).map((n) => n.source_file_id));
    let imported = 0;
    let skipped = 0;

    for (const file of pptFiles) {
      const sourceFileId = `canvas_file_${course.id}_${file.id}`;
      const legacySourceFileId = `canvas_file_${course.platform_id}_${file.id}`;
      if (existingSet.has(sourceFileId) || existingSet.has(legacySourceFileId)) {
        skipped++;
        continue;
      }

      let downloadUrl = file.url;
      let contentType = file["content-type"] || file.content_type || "";

      if (!downloadUrl) {
        const detail = await fetchCanvasFileById(
          connection.canvas_domain,
          connection.access_token,
          Number(course.platform_id),
          file.id
        );
        if (!detail) continue;
        downloadUrl = detail?.url;
        contentType = detail?.["content-type"] || detail?.content_type || contentType;
      }

      if (!downloadUrl) continue;

      if (file.size && file.size > MAX_POWERPOINT_BYTES) continue;
      const fileType = detectFileType(contentType, file.filename || file.display_name);
      if (fileType !== "pptx") continue;

      const { buffer } = await downloadCanvasFile(
        connection.canvas_domain,
        connection.access_token,
        downloadUrl,
        MAX_POWERPOINT_BYTES
      );
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
      { error: "Failed to sync Canvas PowerPoints." },
      { status: 500 }
    );
  }
}
