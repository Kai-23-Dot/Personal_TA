import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { detectFileType, extractFileText } from "@/backend/utils/extractFileText";
import {
  downloadCanvasFile,
  fetchCanvasFileById,
} from "@/backend/lms/canvas";
import { getCanvasCourseContext } from "@/backend/lms/canvasConnection";
import { z } from "zod";

const importCanvasFileSchema = z.object({
  courseId: z.string().uuid(),
  fileId: z.number().int().positive(),
}).strict();
const MAX_CANVAS_FILE_BYTES = 20 * 1024 * 1024;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsedBody = importCanvasFileSchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Valid courseId and fileId are required." }, { status: 400 });
  }
  const { courseId, fileId } = parsedBody.data;

  const context = await getCanvasCourseContext(supabase, user.id, courseId);
  if (!context) {
    return NextResponse.json({ error: "Course not linked to Canvas" }, { status: 400 });
  }
  const { connection, course } = context;

  const sourceFileId = `canvas_file_${course.id}_${fileId}`;
  const legacySourceFileId = `canvas_file_${course.platform_id}_${fileId}`;
  const { data: existing } = await supabase
    .from("notes")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", course.id)
    .in("source_file_id", [sourceFileId, legacySourceFileId])
    .maybeSingle();

  if (existing?.id) {
    return NextResponse.json({ success: true, noteId: existing.id, reused: true });
  }

  const fileData = await fetchCanvasFileById(
    connection.canvas_domain,
    connection.access_token,
    Number(course.platform_id),
    fileId
  );
  if (!fileData) {
    return NextResponse.json({ error: "Could not fetch Canvas file details" }, { status: 400 });
  }

  const downloadUrl = fileData?.url;
  const contentType = fileData?.["content-type"] || fileData?.content_type || "";

  if (!downloadUrl) {
    return NextResponse.json({ error: "Canvas file has no download URL" }, { status: 400 });
  }

  if (fileData.size && fileData.size > MAX_CANVAS_FILE_BYTES) {
    return NextResponse.json({ error: "Canvas file exceeds the 20 MB limit." }, { status: 413 });
  }

  const fileType = detectFileType(
    contentType,
    fileData.filename || fileData.display_name
  );
  if (!fileType) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    ({ buffer } = await downloadCanvasFile(
      connection.canvas_domain,
      connection.access_token,
      downloadUrl,
      MAX_CANVAS_FILE_BYTES
    ));
  } catch (error) {
    console.error("[import-canvas-file] Download failed:", error);
    return NextResponse.json({ error: "Failed to download Canvas file" }, { status: 400 });
  }

  const content = await extractFileText(buffer, fileType);

  if (!content) {
    return NextResponse.json({ error: "Could not extract text from file" }, { status: 400 });
  }

  const noteFileType: string =
    fileType === "pdf" ? "pdf"
    : fileType === "docx" ? "docx"
    : fileType === "pptx" ? "pptx"
    : fileType === "txt" ? "txt"
    : "other";

  const { data: note, error } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      course_id: course.id,
      title: fileData.display_name || fileData.filename || "Canvas File",
      content,
      source_type: "canvas",
      source_file_id: sourceFileId,
      source_url: fileData.url,
      file_name: fileData.filename ?? null,
      file_type: noteFileType,
      file_size_bytes: fileData.size ?? null,
      is_processed: true,
    })
    .select()
    .single();

  if (error) {
    console.error("[import-canvas-file] Note insert failed:", error);
    return NextResponse.json({ error: "Failed to save imported Canvas file." }, { status: 500 });
  }
  return NextResponse.json({ success: true, noteId: note.id });
}
