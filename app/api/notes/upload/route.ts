import { createClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import { generateEmbedding } from "@/backend/utils/embeddings";
import { generateText } from "ai";
import { visionModel } from "@/backend/ai/provider";
import { v4 as uuidv4 } from "uuid";
import { assertWithinLimits } from "@/backend/billing/limits";
import { runWithUsageContext } from "@/backend/billing/usageContext";
import { extractFileText } from "@/backend/utils/extractFileText";
import { validateNoteUpload } from "@/backend/utils/uploadValidation";
import { z } from "zod";

export const maxDuration = 60;

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

async function extractTextFromFile(file: File, buffer: Buffer): Promise<string> {
  const fileName = file.name.toLowerCase();
  const mimeType = file.type;

  if (fileName.endsWith(".txt") || fileName.endsWith(".md")) {
    return (await extractFileText(buffer, "txt")) ?? "";
  }

  if (fileName.endsWith(".pdf")) {
    return (await extractFileText(buffer, "pdf")) ?? "";
  }

  if (fileName.endsWith(".pptx")) {
    const text = await extractFileText(buffer, "pptx");
    if (text) return text;
  }

  if (fileName.endsWith(".docx")) {
    return (await extractFileText(buffer, "docx")) ?? "";
  }

  if (fileName.endsWith(".mp3") || fileName.endsWith(".wav") || fileName.endsWith(".m4a")) {
    const { transcribeAudio } = await import("@/backend/ai/transcribeAudio");
    const { structuredNotes } = await transcribeAudio(buffer, file.name);
    return structuredNotes;
  }

  // Handwritten or typed image notes — use Gemini Vision
  if (IMAGE_MIME_TYPES.has(mimeType) || /\.(jpe?g|png|webp|gif)$/i.test(fileName)) {
    const resolvedMime = IMAGE_MIME_TYPES.has(mimeType) ? mimeType : "image/jpeg";
    const { text } = await generateText({
      model: visionModel,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: buffer,
              mimeType: resolvedMime as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            },
            {
              type: "text",
              text: `You are transcribing a handwritten or typed student note. Extract ALL visible content from this image accurately.

Rules:
- Transcribe every piece of text, equation, and label visible in the image.
- For mathematical expressions, use LaTeX notation: inline math with $...$ and display math with $$...$$.
- Example: "The quadratic formula is $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$"
- Preserve the original structure (headings, numbered steps, bullet points, tables).
- For diagrams or graphs, add a brief description in [brackets], e.g. [Diagram: unit circle with labelled angles].
- If text is partially illegible, include your best guess and mark it with [?].
- Output plain text with LaTeX math only — no extra commentary or preamble.`,
            },
          ],
        },
      ],
    });
    return text;
  }

  throw new Error(`Unsupported file type: ${fileName}`);
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    // Plan limits: block Free users at the weekly note cap or daily token cap.
    const limitCheck = await assertWithinLimits(user.id, ["note", "tokens"]);
    if (!limitCheck.ok) {
      return NextResponse.json(
        { success: false, error: limitCheck.reason, code: "LIMIT_REACHED", feature: limitCheck.feature, limit: limitCheck.limit, used: limitCheck.used },
        { status: 402 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const courseId = formData.get("courseId") as string | null;
    const unitName = formData.get("unitName") as string | null;
    const examName = formData.get("examName") as string | null;
    const topicTagsRaw = (formData.get("topicTags") as string | null) ?? "";

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }
    let validatedFile: ReturnType<typeof validateNoteUpload>;
    try {
      validatedFile = validateNoteUpload(file);
    } catch (validationError) {
      return NextResponse.json(
        {
          success: false,
          error:
            validationError instanceof Error
              ? validationError.message
              : "Invalid upload.",
        },
        { status: 400 }
      );
    }

    let verifiedCourseId: string | null = null;
    if (courseId) {
      const parsedCourseId = z.string().uuid().safeParse(courseId);
      if (!parsedCourseId.success) {
        return NextResponse.json(
          { success: false, error: "Invalid course." },
          { status: 400 }
        );
      }
      const { data: course } = await supabase
        .from("courses")
        .select("id")
        .eq("id", parsedCourseId.data)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!course) {
        return NextResponse.json(
          { success: false, error: "Course not found." },
          { status: 404 }
        );
      }
      verifiedCourseId = course.id;
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let content: string;
    try {
      // Extraction may call vision/transcription models — attribute tokens to the user.
      content = await runWithUsageContext(user.id, () =>
        extractTextFromFile(file, buffer)
      );
      if (!content.trim()) throw new Error("No readable text was found.");
    } catch (err) {
      console.warn("[notes/upload] Extraction failed:", err);
      return NextResponse.json(
        { success: false, error: "Could not extract readable text from this file." },
        { status: 400 }
      );
    }

    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const fileType = validatedFile.fileType;
    const title = validatedFile.safeFileName.replace(/\.[^/.]+$/, "");
    const noteId = uuidv4();

    // Upload raw file to Supabase Storage
    const storagePath = `${user.id}/notes/${noteId}/${validatedFile.safeFileName}`;
    const { error: storageError } = await supabase.storage
      .from("notes")
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (storageError) {
      console.error("[notes/upload] Storage upload failed:", storageError);
      return NextResponse.json(
        { success: false, error: "Failed to store the uploaded file." },
        { status: 500 }
      );
    }

    // Generate embedding
    let embedding: number[] | null = null;
    try {
      embedding = await generateEmbedding(content.slice(0, 8000));
    } catch (err) {
      console.warn("[upload] Embedding failed:", err);
    }

    const { data: note, error } = await supabase
      .from("notes")
      .insert({
        id: noteId,
        user_id: user.id,
        course_id: verifiedCourseId,
        title,
        content,
        source_type: "upload" as const,
        file_name: validatedFile.safeFileName,
        file_type: fileType,
        file_size_bytes: file.size,
        storage_path: storagePath,
        word_count: wordCount,
        unit_name: unitName?.trim().slice(0, 120) || null,
        exam_name: examName?.trim().slice(0, 120) || null,
        topic_tags: topicTagsRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 20)
          .map((tag) => tag.slice(0, 60)),
        is_processed: true,
        embedding: embedding ? `[${embedding.join(",")}]` : null,
      })
      .select()
      .single();

    if (error) {
      await supabase.storage.from("notes").remove([storagePath]);
      console.error("[notes/upload] Note insert failed:", error);
      return NextResponse.json(
        { success: false, error: "Failed to save the uploaded note." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        noteId: note.id,
        title: note.title,
        wordCount: note.word_count,
        isProcessed: note.is_processed,
      },
    });
  } catch (err) {
    console.error("[/api/notes/upload] Error:", err);
    return NextResponse.json(
      { success: false, error: "Note upload failed." },
      { status: 500 }
    );
  }
}
