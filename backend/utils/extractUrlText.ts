import { fetchPublicResource } from "@/backend/security/publicUrl";
import { normalizeDocumentText } from "@/backend/canvas-intelligence/documentNormalizer";
import { extractFileText } from "./extractFileText";
import { extractWebsiteText } from "./extractWebsiteText";
import { extractYoutubeText, isYoutubeUrl } from "./extractYoutubeText";

export interface ExtractedUrlContent {
  text: string;
  title: string | null;
  sourceUrl: string;
  sourceType: "website" | "youtube" | "pdf";
  language?: string | null;
}

/** Backend-only entry point for public website, PDF, and YouTube links. */
export async function extractUrlText(url: string): Promise<ExtractedUrlContent> {
  if (isYoutubeUrl(url)) {
    return { ...await extractYoutubeText(url), sourceUrl: url, sourceType: "youtube" };
  }

  const resource = await fetchPublicResource(url, { maxBytes: 25 * 1024 * 1024 });
  // Short links may redirect to YouTube. Never index a watch page as a transcript.
  if (isYoutubeUrl(resource.url)) {
    return { ...await extractYoutubeText(resource.url), sourceUrl: resource.url, sourceType: "youtube" };
  }
  const mime = resource.contentType.split(";")[0].trim().toLowerCase();
  const isPdf = resource.buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mime === "application/pdf" || isPdf) {
    const text = await extractFileText(resource.buffer, "pdf");
    if (!text) throw new Error("The PDF contains no extractable text or could not be read. Scanned PDFs require OCR.");
    return { text, title: null, sourceUrl: resource.url, sourceType: "pdf" };
  }
  if (!["text/html", "application/xhtml+xml", "text/plain"].includes(mime)) {
    throw new Error(`Unsupported website content type: ${mime || "unknown"}.`);
  }
  if (resource.buffer.length > 5 * 1024 * 1024) throw new Error("The webpage exceeds the 5 MB text limit.");
  const charset = resource.contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] ?? "utf-8";
  let decoded: string;
  try { decoded = new TextDecoder(charset).decode(resource.buffer); }
  catch { throw new Error(`Unsupported webpage character encoding: ${charset}.`); }
  const content = mime === "text/plain"
    ? { text: normalizeDocumentText(decoded), title: null }
    : extractWebsiteText(decoded);
  if (!content.text) throw new Error("The website returned no readable text.");
  return { ...content, sourceUrl: resource.url, sourceType: "website" };
}
