/**
 * POST /api/notes/ocr
 *
 * Upload an image (JPG/PNG/WEBP/GIF) and extract text using AI vision.
 * Stores the result as a Note in Supabase.
 */
import { createClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import { extractTextFromImage, type ImageMediaType } from "@/backend/ai/ocrImage";
import { generateEmbedding } from "@/backend/utils/embeddings";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 60;

const SUPPORTED_IMAGE_TYPES: Record<string, ImageMediaType> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const courseId = formData.get("courseId") as string | null;
    const context = formData.get("context") as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    const mediaType = SUPPORTED_IMAGE_TYPES[file.type];
    if (!mediaType) {
      return NextResponse.json(
        { success: false, error: `Unsupported image type: ${file.type}. Use JPEG, PNG, WebP, or GIF.` },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "Image must be under 5 MB" },
        { status: 400 }
      );
    }

    const imageBuffer = Buffer.from(await file.arrayBuffer());

    // Run OCR via AI vision
    const { extractedText, structuredContent, confidence, warnings } =
      await extractTextFromImage(imageBuffer, mediaType, context ?? undefined);

    if (!extractedText.trim()) {
      return NextResponse.json(
        { success: false, error: "No text could be extracted from this image" },
        { status: 422 }
      );
    }

    const noteId = uuidv4();
    const title = file.name.replace(/\.[^/.]+$/, "") || "Handwritten Note";

    // Upload image to Supabase Storage
    const storagePath = `${user.id}/notes/${noteId}/${file.name}`;
    await supabase.storage
      .from("notes")
      .upload(storagePath, imageBuffer, { contentType: file.type, upsert: false });

    // Generate embedding
    let embedding: number[] | null = null;
    try {
      embedding = await generateEmbedding(structuredContent.slice(0, 8000));
    } catch {
      // Non-fatal
    }

    const wordCount = structuredContent.split(/\s+/).filter(Boolean).length;

    const { data: note, error } = await supabase
      .from("notes")
      .insert({
        id: noteId,
        user_id: user.id,
        course_id: courseId ?? null,
        title,
        content: structuredContent,
        source_type: "upload",
        file_name: file.name,
        file_type: "image",
        file_size_bytes: file.size,
        storage_path: storagePath,
        word_count: wordCount,
        is_processed: true,
        embedding: embedding ? `[${embedding.join(",")}]` : null,
        topic_tags: [],
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        noteId: note.id,
        title: note.title,
        wordCount,
        confidence,
        warnings,
        rawText: extractedText,
      },
    });
  } catch (err) {
    console.error("[/api/notes/ocr] Error:", err);
    return NextResponse.json({ success: false, error: (err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
