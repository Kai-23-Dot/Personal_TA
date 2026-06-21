import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { extractFileText, mimeToFileType } from "@/backend/utils/extractFileText";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { courseId, fileId } = body as { courseId: string; fileId: number };
  if (!courseId || !fileId) return NextResponse.json({ error: "courseId and fileId required" }, { status: 400 });

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

  const sourceFileId = `canvas_file_${course.platform_id}_${fileId}`;
  const { data: existing } = await supabase
    .from("notes")
    .select("id")
    .eq("user_id", user.id)
    .eq("source_file_id", sourceFileId)
    .maybeSingle();

  if (existing?.id) {
    return NextResponse.json({ success: true, noteId: existing.id, reused: true });
  }

  const fileRes = await fetch(`https://${connection.canvas_domain}/api/v1/files/${fileId}`, {
    headers: { Authorization: `Bearer ${connection.access_token}` },
  });

  if (!fileRes.ok) {
    return NextResponse.json({ error: "Could not fetch Canvas file details" }, { status: 400 });
  }

  const fileData = await fileRes.json();
  const downloadUrl = fileData?.url;
  const contentType = fileData?.["content-type"] || fileData?.content_type || "";

  if (!downloadUrl) {
    return NextResponse.json({ error: "Canvas file has no download URL" }, { status: 400 });
  }

  const fileType = mimeToFileType(contentType);
  if (!fileType) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  const downloadRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${connection.access_token}` },
  });

  if (!downloadRes.ok) {
    return NextResponse.json({ error: "Failed to download Canvas file" }, { status: 400 });
  }

  const buffer = Buffer.from(await downloadRes.arrayBuffer());
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, noteId: note.id });
}
