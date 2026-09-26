/**
 * Reading a YouTube video as its caption track.
 *
 * YouTube has no public transcript API. This reads the caption tracks listed in
 * the watch page's player config, which is the same route the community
 * libraries take. Worth being clear about what that means:
 *
 *   - It breaks when YouTube changes its page shape, with no warning.
 *   - It is frequently refused from datacenter IP ranges, which is exactly
 *     what a Vercel function runs on, so it will fail in production more often
 *     than it does locally.
 *   - A video with captions disabled has nothing to read.
 *
 * So every failure path returns a specific, honest reason, and the caller is
 * expected to tell the student what to do instead rather than pretending the
 * import merely "failed". The reliable path for a video is uploading the file,
 * which goes through the existing transcription route.
 */

const FETCH_TIMEOUT_MS = 15_000;

const USER_AGENT =
  "Mozilla/5.0 (compatible; SmartlearnBot/1.0; +https://smartlearn.app)";

export type TranscriptFailure =
  | "not-a-video"
  | "unavailable"
  | "no-captions"
  | "blocked";

export class YouTubeTranscriptError extends Error {
  constructor(
    readonly reason: TranscriptFailure,
    message: string
  ) {
    super(message);
  }
}

/** Accepts the watch, short-link, embed and Shorts forms. */
export function parseVideoId(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // A bare id pasted on its own.
    return /^[\w-]{11}$/.test(raw.trim()) ? raw.trim() : null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    return /^[\w-]{11}$/.test(id) ? id : null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;

    const embedded = url.pathname.match(/^\/(?:embed|shorts|v)\/([\w-]{11})/);
    if (embedded) return embedded[1];
  }

  return null;
}

interface CaptionTrack {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
}

function pickTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;
  // Prefer a human-written English track, then any English, then whatever the
  // video has — an auto-generated track is still far better than nothing.
  return (
    tracks.find((t) => t.languageCode?.startsWith("en") && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode?.startsWith("en")) ??
    tracks[0]
  );
}

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)));
}

export interface VideoTranscript {
  title: string;
  text: string;
  videoId: string;
}

export async function fetchYouTubeTranscript(rawUrl: string): Promise<VideoTranscript> {
  const videoId = parseVideoId(rawUrl);
  if (!videoId) {
    throw new YouTubeTranscriptError(
      "not-a-video",
      "That does not look like a YouTube link."
    );
  }

  let watchHtml: string;
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 429 || res.status === 403) {
      throw new YouTubeTranscriptError(
        "blocked",
        "YouTube refused the request for this video."
      );
    }
    if (!res.ok) {
      throw new YouTubeTranscriptError("unavailable", "That video could not be reached.");
    }
    watchHtml = await res.text();
  } catch (error) {
    if (error instanceof YouTubeTranscriptError) throw error;
    throw new YouTubeTranscriptError("unavailable", "That video could not be reached.");
  }

  const titleMatch = watchHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? decodeEntities(titleMatch[1]).replace(/\s*-\s*YouTube\s*$/, "").trim()
    : `YouTube video ${videoId}`;

  const tracksMatch = watchHtml.match(/"captionTracks":(\[.*?\])/);
  if (!tracksMatch) {
    // No caption config at all usually means captions are off, but a consent
    // or bot wall produces the same absence — say so without guessing.
    throw new YouTubeTranscriptError(
      "no-captions",
      "No captions are available for that video."
    );
  }

  let tracks: CaptionTrack[];
  try {
    tracks = JSON.parse(tracksMatch[1]);
  } catch {
    throw new YouTubeTranscriptError("no-captions", "That video's captions could not be read.");
  }

  const track = pickTrack(tracks);
  if (!track?.baseUrl) {
    throw new YouTubeTranscriptError("no-captions", "No captions are available for that video.");
  }

  let captionXml: string;
  try {
    const res = await fetch(track.baseUrl.replace(/\\u0026/g, "&"), {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new YouTubeTranscriptError("blocked", "That video's captions could not be downloaded.");
    }
    captionXml = await res.text();
  } catch (error) {
    if (error instanceof YouTubeTranscriptError) throw error;
    throw new YouTubeTranscriptError("blocked", "That video's captions could not be downloaded.");
  }

  const text = Array.from(captionXml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g))
    .map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, " ")))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    throw new YouTubeTranscriptError("no-captions", "That video's captions were empty.");
  }

  return { title, text, videoId };
}
