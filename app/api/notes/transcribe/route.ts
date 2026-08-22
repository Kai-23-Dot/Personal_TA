/**
 * POST /api/notes/transcribe
 *
 * Upload an audio file (MP3, M4A, WAV, etc.), transcribe it with OpenAI GPT,
 * and structure it as lecture notes.
 */
import { createClient } from "@/backend/supabase/server";
import { NextResponse } from "next/server";
import { transcribeAudio } from "@/backend/ai/transcribeAudio";
import { generateEmbedding } from "@/backend/utils/embeddings";
import { v4 as uuidv4 } from "uuid";
import {
  assertWithinLimit,
  assertWithinLimits,
  UsageLimitError,
} from "@/backend/billing/limits";
import { runWithUsageContext } from "@/backend/billing/usageContext";
import { validateNoteUpload } from "@/backend/utils/uploadValidation";
import { z } from "zod";

export const maxDuration = 120; // Audio processing can take a while

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const limitCheck = await assertWithinLimits(user.id, [
      "note",
      "ai_credits",
      "audio_seconds",
      "storage_bytes",
    ]);
    if (!limitCheck.ok) {
      return NextResponse.json(
        { success: false, error: limitCheck.reason, code: "LIMIT_REACHED" },
        { status: 402 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const courseId = formData.get("courseId") as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    let safeFileName: string;
    try {
      safeFileName = validateNoteUpload(file, new Set(["audio"])).safeFileName;
    } catch (validationError) {
      return NextResponse.json(
        {
          success: false,
          error: validationError instanceof Error
            ? validationError.message
            : "Invalid audio file.",
        },
        { status: 400 }
      );
    }

    const storageCheck = await assertWithinLimit(
      user.id,
      "storage_bytes",
      file.size
    );
    if (!storageCheck.ok) {
      return NextResponse.json(
        { success: false, error: storageCheck.reason, code: "LIMIT_REACHED" },
        { status: 402 }
      );
    }

    // Fetch course name for context
    let courseName: string | undefined;
    let verifiedCourseId: string | null = null;
    if (courseId) {
      const parsedCourseId = z.string().uuid().safeParse(courseId);
      const { data: course } = parsedCourseId.success
        ? await supabase
            .from("courses")
            .select("id, name")
            .eq("id", parsedCourseId.data)
            .eq("user_id", user.id)
            .eq("is_active", true)
            .maybeSingle()
        : { data: null };
      if (!course) {
        return NextResponse.json(
          { success: false, error: "Course not found." },
          { status: 404 }
        );
      }
      courseName = course?.name;
      verifiedCourseId = course.id;
    }

    const audioBuffer = Buffer.from(await file.arrayBuffer());

    const { rawTranscript, structuredNotes } = await runWithUsageContext(
      user.id,
      () => transcribeAudio(
        audioBuffer,
        safeFileName,
        courseName
      )
    );

    const noteId = uuidv4();
    const title = safeFileName.replace(/\.[^/.]+$/, "") || "Lecture Recording";
    const wordCount = structuredNotes.split(/\s+/).filter(Boolean).length;

    // Store original audio in Supabase Storage
    const storagePath = `${user.id}/audio/${noteId}/${safeFileName}`;
    const { error: storageError } = await supabase.storage
      .from("notes")
      .upload(storagePath, audioBuffer, { contentType: file.type });
    if (storageError) {
      console.error("[notes/transcribe] Storage upload failed:", storageError);
      return NextResponse.json(
        { success: false, error: "Failed to store the audio file." },
        { status: 500 }
      );
    }

    // Generate embedding
    let embedding: number[] | null = null;
    try {
      embedding = await generateEmbedding(structuredNotes.slice(0, 8000));
    } catch {
      // Non-fatal
    }

    const { data: note, error } = await supabase
      .from("notes")
      .insert({
        id: noteId,
        user_id: user.id,
        course_id: verifiedCourseId,
        title,
        content: structuredNotes,
        source_type: "upload",
        file_name: safeFileName,
        file_type: "audio",
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
      console.error("[notes/transcribe] Note insert failed:", error);
      return NextResponse.json(
        { success: false, error: "Failed to save the transcript." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        noteId: note.id,
        title: note.title,
        wordCount,
        rawTranscriptLength: rawTranscript.length,
      },
    });
  } catch (err) {
    console.error("[/api/notes/transcribe] Error:", err);
    if (err instanceof UsageLimitError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: 402 }
      );
    }
    return NextResponse.json({ success: false, error: "Audio transcription failed." }, { status: 500 });
  }
}
