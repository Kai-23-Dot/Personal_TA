/**
 * POST /api/notebooks/[id]/import
 *
 * Imports a link into a notebook: a web page, or a YouTube video by way of its
 * captions. Files go through /api/notes/upload, which already handles
 * extraction, storage and OCR.
 *
 * Whatever the source, it lands as a note with its text embedded, which is
 * what makes study guides, practice generation, flashcards and the assistant
 * work on it without any of them knowing where it came from.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { z } from "zod";
import { ingestSource } from "@/backend/notebooks/ingestSource";
import { fetchWebPage, WebPageError } from "@/backend/notebooks/fetchWebPage";
import {
  fetchYouTubeTranscript,
  parseVideoId,
  YouTubeTranscriptError,
} from "@/backend/notebooks/fetchYouTubeTranscript";

const importSchema = z.object({
  url: z.string().trim().min(1).max(2000),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = importSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Paste a link to import." }, { status: 400 });
  }

  // The notebook must be the caller's, and its course is what any generated
  // material will be attributed to.
  const { data: notebook } = await supabase
    .from("notebooks")
    .select("id, course_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!notebook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = parsed.data.url;
  const isVideo = parseVideoId(url) !== null;

  try {
    if (isVideo) {
      const video = await fetchYouTubeTranscript(url);
      const source = await ingestSource(supabase, {
        userId: user.id,
        notebookId: notebook.id,
        courseId: notebook.course_id,
        title: video.title,
        content: video.text,
        sourceUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
        kind: "youtube",
      });
      return NextResponse.json({ source });
    }

    const page = await fetchWebPage(url);
    const source = await ingestSource(supabase, {
      userId: user.id,
      notebookId: notebook.id,
      courseId: notebook.course_id,
      title: page.title,
      content: page.text,
      sourceUrl: url,
      kind: "url",
    });
    return NextResponse.json({ source });
  } catch (error) {
    // Captions are read from a page YouTube does not publish for this purpose,
    // and it refuses datacenter traffic often. Say which wall was hit and what
    // to do instead, rather than reporting a generic failure.
    if (error instanceof YouTubeTranscriptError) {
      const hint =
        error.reason === "no-captions"
          ? "Captions are off for that video. Download the audio and upload the file instead."
          : error.reason === "blocked"
            ? "YouTube blocked this request, which it often does from a server. Uploading the audio file works reliably."
            : null;
      return NextResponse.json(
        { error: error.message, hint, reason: error.reason },
        { status: 422 }
      );
    }

    if (error instanceof WebPageError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    console.error("[notebooks/import] Unexpected failure:", error);
    return NextResponse.json({ error: "That source could not be imported." }, { status: 500 });
  }
}
