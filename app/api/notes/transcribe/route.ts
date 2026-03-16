/**
 * POST /api/notes/transcribe
 *
 * Upload an audio file (MP3, M4A, WAV, etc.) and transcribe it via Gemini,
 * then structure it as lecture notes.
 */
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/ai/transcribeAudio";
import { generateEmbedding } from "@/lib/utils/embeddings";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 120; // Audio processing can take a while

const SUPPORTED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/wav",
  "audio/wave",
  "audio/webm",
  "audio/ogg",
];

const MAX_AUDIO_SIZE = 20 * 1024 * 1024; // 20 MB (Gemini inline limit)

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const courseId = formData.get("courseId") as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    if (!SUPPORTED_AUDIO_TYPES.some((t) => file.type.includes(t.split("/")[1]))) {
      return NextResponse.json(
        { success: false, error: `Unsupported format. Use: MP3, M4A, WAV, WebM, OGG` },
        { status: 400 }
      );
    }

    if (file.size > MAX_AUDIO_SIZE) {
      return NextResponse.json(
        { success: false, error: "Audio file must be under 20 MB" },
        { status: 400 }
      );
    }

    // Fetch course name for context
    let courseName: string | undefined;
    if (courseId) {
      const { data: course } = await supabase
        .from("courses")
        .select("name")
        .eq("id", courseId)
        .single();
      courseName = course?.name;
    }

    const audioBuffer = Buffer.from(await file.arrayBuffer());

    const { rawTranscript, structuredNotes } = await transcribeAudio(
      audioBuffer,
      file.name,
      courseName
    );

    const noteId = uuidv4();
    const title = file.name.replace(/\.[^/.]+$/, "") || "Lecture Recording";
    const wordCount = structuredNotes.split(/\s+/).filter(Boolean).length;

    // Store original audio in Supabase Storage
    const storagePath = `${user.id}/audio/${noteId}/${file.name}`;
    await supabase.storage
      .from("notes")
      .upload(storagePath, audioBuffer, { contentType: file.type });

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
        course_id: courseId ?? null,
        title,
        content: structuredNotes,
        source_type: "upload",
        file_name: file.name,
        file_type: "other",
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
        rawTranscriptLength: rawTranscript.length,
      },
    });
  } catch (err) {
    console.error("[/api/notes/transcribe] Error:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
