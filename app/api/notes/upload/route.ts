import { createClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import { generateEmbedding } from "@/backend/utils/embeddings";
import { generateText } from "ai";
import { chatModel } from "@/backend/ai/provider";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 60;

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

async function extractTextFromFile(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name.toLowerCase();
  const mimeType = file.type;

  if (fileName.endsWith(".txt") || fileName.endsWith(".md")) {
    return buffer.toString("utf-8");
  }

  if (fileName.endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (fileName.endsWith(".pptx")) {
    const { extractFileText } = await import("@/backend/utils/extractFileText");
    const text = await extractFileText(buffer, "pptx");
    if (text) return text;
  }

  if (fileName.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (fileName.endsWith(".mp3") || fileName.endsWith(".wav") || fileName.endsWith(".m4a")) {
    const { transcribeAudio } = await import("@/backend/ai/transcribeAudio");
    const { structuredNotes } = await transcribeAudio(buffer, file.name);
    return structuredNotes;
  }

  // Handwritten or typed image notes — use Gemini Vision
  if (IMAGE_MIME_TYPES.has(mimeType) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(fileName)) {
    const resolvedMime = IMAGE_MIME_TYPES.has(mimeType) ? mimeType : "image/jpeg";
    const { text } = await generateText({
      model: chatModel,
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

function getFileType(file: File): string {
  const fileName = file.name.toLowerCase();
  const mimeType = file.type;
  const ext = fileName.split(".").pop() ?? "";

  if (IMAGE_MIME_TYPES.has(mimeType) || /^(jpe?g|png|webp|gif|heic|heif)$/.test(ext)) {
    return "image";
  }

  const map: Record<string, string> = { pdf: "pdf", docx: "docx", pptx: "pptx", txt: "txt", md: "md" };
  if (/(mp3|wav|m4a)$/.test(ext)) return "audio";
  return map[ext] ?? "other";
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const courseId = formData.get("courseId") as string | null;
    const unitName = formData.get("unitName") as string | null;
    const examName = formData.get("examName") as string | null;
    const topicTagsRaw = (formData.get("topicTags") as string | null) ?? "";

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    let content: string;
    try {
      content = await extractTextFromFile(file);
    } catch (err) {
      return NextResponse.json(
        { success: false, error: `Could not extract text: ${(err as Error).message}` },
        { status: 400 }
      );
    }

    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const fileType = getFileType(file);
    const title = file.name.replace(/\.[^/.]+$/, "");
    const noteId = uuidv4();

    // Upload raw file to Supabase Storage
    const storagePath = `${user.id}/notes/${noteId}/${file.name}`;
    await supabase.storage
      .from("notes")
      .upload(storagePath, await file.arrayBuffer(), {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

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
        course_id: courseId || null,
        title,
        content,
        source_type: "upload" as const,
        file_name: file.name,
        file_type: fileType,
        file_size_bytes: file.size,
        storage_path: storagePath,
        word_count: wordCount,
        unit_name: unitName?.trim() || null,
        exam_name: examName?.trim() || null,
        topic_tags: topicTagsRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        is_processed: true,
        embedding: embedding ? `[${embedding.join(",")}]` : null,
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
        wordCount: note.word_count,
        isProcessed: note.is_processed,
      },
    });
  } catch (err) {
    console.error("[/api/notes/upload] Error:", err);
    return NextResponse.json(
      { success: false, error: (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}
