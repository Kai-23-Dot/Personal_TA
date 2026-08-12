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
import { assertWithinLimits } from "@/backend/billing/limits";
import { runWithUsageContext } from "@/backend/billing/usageContext";
import { validateNoteUpload } from "@/backend/utils/uploadValidation";
import { z } from "zod";

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
    const limitCheck = await assertWithinLimits(user.id, ["note", "tokens"]);
    if (!limitCheck.ok) {
      return NextResponse.json(
        { success: false, error: limitCheck.reason, code: "LIMIT_REACHED" },
        { status: 402 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const courseId = formData.get("courseId") as string | null;
    const context = formData.get("context") as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    let safeFileName: string;
    try {
      safeFileName = validateNoteUpload(file, new Set(["image"])).safeFileName;
    } catch (validationError) {
      return NextResponse.json(
        {
          success: false,
          error: validationError instanceof Error
            ? validationError.message
            : "Invalid image.",
        },
        { status: 400 }
      );
    }

    const mediaType = SUPPORTED_IMAGE_TYPES[file.type];
    if (!mediaType) {
      return NextResponse.json(
        { success: false, error: `Unsupported image type: ${file.type}. Use JPEG, PNG, WebP, or GIF.` },
        { status: 400 }
      );
    }

    let verifiedCourseId: string | null = null;
    if (courseId) {
      const parsedCourseId = z.string().uuid().safeParse(courseId);
      const { data: course } = parsedCourseId.success
        ? await supabase
            .from("courses")
            .select("id")
            .eq("id", parsedCourseId.data)
            .eq("user_id", user.id)
            .maybeSingle()
        : { data: null };
      if (!course) {
        return NextResponse.json(
          { success: false, error: "Course not found." },
          { status: 404 }
        );
      }
      verifiedCourseId = course.id;
    }

    const imageBuffer = Buffer.from(await file.arrayBuffer());

    // Run OCR via AI vision
    const { extractedText, structuredContent, confidence, warnings } =
      await runWithUsageContext(user.id, () =>
        extractTextFromImage(
          imageBuffer,
          mediaType,
          context?.slice(0, 500) ?? undefined
        )
      );

    if (!extractedText.trim()) {
      return NextResponse.json(
        { success: false, error: "No text could be extracted from this image" },
        { status: 422 }
      );
    }

    const noteId = uuidv4();
    const title = safeFileName.replace(/\.[^/.]+$/, "") || "Handwritten Note";

    // Upload image to Supabase Storage
    const storagePath = `${user.id}/notes/${noteId}/${safeFileName}`;
    const { error: storageError } = await supabase.storage
      .from("notes")
      .upload(storagePath, imageBuffer, { contentType: file.type, upsert: false });
    if (storageError) {
      console.error("[notes/ocr] Storage upload failed:", storageError);
      return NextResponse.json(
        { success: false, error: "Failed to store the uploaded image." },
        { status: 500 }
      );
    }

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
        course_id: verifiedCourseId,
        title,
        content: structuredContent,
        source_type: "upload",
        file_name: safeFileName,
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
      await supabase.storage.from("notes").remove([storagePath]);
      console.error("[notes/ocr] Note insert failed:", error);
      return NextResponse.json(
        { success: false, error: "Failed to save the extracted note." },
        { status: 500 }
      );
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
    return NextResponse.json({ success: false, error: "Image extraction failed." }, { status: 500 });
  }
}
