import { fetchPublicResource } from "@/backend/security/publicUrl";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
  "youtu.be", "www.youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com",
]);
const MAX_TRANSCRIPT_CHARS = 500_000;

type JsonObject = Record<string, unknown>;
type CaptionTrack = { baseUrl: string; languageCode: string | null; kind: string | null };

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject : null;
}

function youtubeUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol)
      && !url.username && !url.password && !url.port && YOUTUBE_HOSTS.has(url.hostname)
      ? url : null;
  } catch {
    return null;
  }
}

/** Recognizes YouTube pages even when the URL does not identify a video. */
export function isYoutubeUrl(value: string): boolean {
  return youtubeUrl(value) !== null;
}

export function parseYoutubeVideoId(value: string): string | null {
  const url = youtubeUrl(value);
  if (!url) return null;
  let id: string | null = null;
  if (url.hostname === "youtu.be" || url.hostname === "www.youtu.be") {
    id = url.pathname.match(/^\/([^/]+)\/?$/)?.[1] ?? null;
  } else if (url.pathname === "/watch" || url.pathname === "/watch/") {
    id = url.searchParams.get("v");
  } else {
    id = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/]+)\/?$/)?.[1] ?? null;
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

/** Read a JSON object embedded in script without evaluating JavaScript. */
function readJsonObject(html: string, start: number): JsonObject | null {
  if (html[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      try { return object(JSON.parse(html.slice(start, i + 1))); }
      catch { return null; }
    }
  }
  return null;
}

function playerResponse(html: string): JsonObject | null {
  const markers = /(?:\bytInitialPlayerResponse\s*=\s*|window\s*\[\s*["']ytInitialPlayerResponse["']\s*\]\s*=\s*|"(?:ytInitialPlayerResponse|playerResponse)"\s*:\s*)/g;
  for (const match of html.matchAll(markers)) {
    const result = readJsonObject(html, (match.index ?? 0) + match[0].length);
    if (result) return result;
  }
  return null;
}

function captionUrl(value: string): URL | null {
  try {
    const url = new URL(value, "https://www.youtube.com");
    const host = url.hostname;
    const allowedHost = host === "youtube.com" || host === "www.youtube.com"
      || host === "video.google.com" || host === "googlevideo.com" || host.endsWith(".googlevideo.com");
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && allowedHost && /^\/(?:api\/)?timedtext$/.test(url.pathname) ? url : null;
  } catch {
    return null;
  }
}

function captionTracks(player: JsonObject): CaptionTrack[] {
  const captions = object(player.captions);
  const renderer = object(captions?.playerCaptionsTracklistRenderer);
  if (!Array.isArray(renderer?.captionTracks)) return [];
  const tracks = renderer.captionTracks.flatMap((value): CaptionTrack[] => {
    const track = object(value);
    if (typeof track?.baseUrl !== "string") return [];
    return [{
      baseUrl: track.baseUrl,
      languageCode: typeof track.languageCode === "string" ? track.languageCode : null,
      kind: typeof track.kind === "string" ? track.kind : null,
    }];
  });
  const rank = (track: CaptionTrack) => (/^en(?:-|$)/i.test(track.languageCode ?? "") ? 0 : 2)
    + (track.kind === "asr" ? 1 : 0);
  return tracks.sort((a, b) => rank(a) - rank(b));
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? match;
    const codePoint = entity[1].toLowerCase() === "x"
      ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
    return codePoint >= 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
      ? String.fromCodePoint(codePoint) : match;
  });
}

function transcriptText(body: string): string | null {
  const lines: string[] = [];
  if (body.trimStart().startsWith("{")) {
    let data: JsonObject | null;
    try { data = object(JSON.parse(body)); } catch { return null; }
    if (!Array.isArray(data?.events)) return null;
    for (const value of data.events) {
      const event = object(value);
      if (!Array.isArray(event?.segs)) continue;
      lines.push(event.segs.map((value) => {
        const segment = object(value);
        return typeof segment?.utf8 === "string" ? segment.utf8 : "";
      }).join(""));
    }
  } else if (/<(?:transcript|timedtext)(?:\s|>)/i.test(body)) {
    for (const match of body.matchAll(/<(text|p)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
      const content = match[2].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, "");
      // XML escaping may wrap caption text that already contains HTML entities.
      lines.push(decodeEntities(content));
    }
  } else return null;
  const text = lines.map((line) => decodeEntities(line).replace(/\s+/g, " ").trim())
    .filter(Boolean).join("\n").slice(0, MAX_TRANSCRIPT_CHARS).trim();
  return text || null;
}

/**
 * Fetch publicly available captions. Restricted, uncaptained, and bot-blocked
 * videos fail explicitly; their descriptions are never used as transcripts.
 * YouTube's public player/caption format is not a stable, documented API.
 */
export async function extractYoutubeText(url: string): Promise<{
  text: string; title: string | null; language: string | null;
}> {
  const videoId = parseYoutubeVideoId(url);
  if (!videoId) throw new Error("A valid YouTube video URL is required.");
  const watch = await fetchPublicResource(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    maxBytes: 5 * 1024 * 1024, timeoutMs: 15_000, maxRedirects: 2,
  });
  if (!isYoutubeUrl(watch.url)) throw new Error("YouTube redirected to an unavailable or restricted page.");
  const player = playerResponse(watch.buffer.toString("utf8"));
  if (!player) throw new Error("YouTube captions are unavailable: the public video player could not be read.");
  const status = object(player.playabilityStatus)?.status;
  if (typeof status === "string" && status !== "OK") {
    throw new Error("YouTube video is unavailable or requires sign-in; public captions could not be read.");
  }
  const details = object(player.videoDetails);
  if (typeof details?.videoId === "string" && details.videoId !== videoId) {
    throw new Error("YouTube returned a different video; captions could not be verified.");
  }
  const tracks = captionTracks(player);
  if (!tracks.length) throw new Error("This YouTube video does not provide publicly available captions.");

  // Bound fallback attempts when the preferred track is unavailable.
  for (const track of tracks.slice(0, 3)) {
    const trackUrl = captionUrl(track.baseUrl);
    if (!trackUrl) continue;
    trackUrl.searchParams.set("fmt", "json3");
    try {
      const captions = await fetchPublicResource(trackUrl.toString(), {
        maxBytes: 5 * 1024 * 1024, timeoutMs: 15_000, maxRedirects: 0,
      });
      if (!captionUrl(captions.url)) continue;
      const text = transcriptText(captions.buffer.toString("utf8"));
      if (text) return {
        text,
        title: typeof details?.title === "string" ? details.title : null,
        language: track.languageCode,
      };
    } catch {
      // Another public track may still be available.
    }
  }
  throw new Error("YouTube captions could not be downloaded or contained no readable transcript.");
}
