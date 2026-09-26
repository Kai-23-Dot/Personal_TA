import { extractUrlText } from "@/backend/utils/extractUrlText";
import { extractFromGoogleLink, extractFromHtml, parseGoogleDriveLink } from "./contentExtractor";
import type { CanvasContentItem } from "./types";

const MAX_LINKS_PER_CRAWL = 8;
const LINK_TYPES = new Set([
  "external_link", "external_video", "embedded_video", "google_doc",
  "google_slide", "google_sheet", "google_drive_file",
]);

/** Resolve discovered links before they become searchable notes. Failures stay
 * out of study content and do not interrupt extraction of other course items. */
export async function resolveLinkedContent(
  items: CanvasContentItem[],
  options: { canvasDomain: string; googleApiKey?: string; oauthAccessToken?: string | null }
): Promise<{ texts: Map<string, string>; errors: string[] }> {
  const texts = new Map<string, string>();
  const errors: string[] = [];
  const links = new Map<string, Promise<string | null>>();
  let skipped = false;

  const resolve = async (item: CanvasContentItem) => {
    const raw = item.bodyHtml
      ? await extractFromHtml(item.bodyHtml)
      : (item.textContent ?? item.fileText ?? item.bodyText ?? "").trim();
    const url = item.externalUrl ?? (LINK_TYPES.has(item.type) ? item.sourceUrl ?? item.url : null);
    const isPlaceholder = !raw || raw === url ||
      (Boolean(url) && /^(?:[\w ]+ )?video: https?:\/\//i.test(raw));
    if (!url || (raw && !isPlaceholder && item.extractionStatus === "extracted")) {
      // The crawler also emits pending Canvas page/file URL nodes. Their real
      // contents are separate items; a URL itself is never extracted content.
      if (raw && !/^https?:\/\/\S+$/i.test(raw)) texts.set(item.id, raw);
      return;
    }
    try {
      const parsed = new URL(url);
      if (!["https:", "http:"].includes(parsed.protocol)) return;
      if (parsed.hostname === options.canvasDomain) return;
      parsed.hash = "";
      const key = parsed.toString();
      if (!links.has(key)) {
        if (links.size >= MAX_LINKS_PER_CRAWL) { skipped = true; return; }
        const extraction = (async () => {
          try {
            const text = parseGoogleDriveLink(key)
              ? await extractFromGoogleLink({ url: key, googleApiKey: options.googleApiKey, oauthAccessToken: options.oauthAccessToken })
              : (await extractUrlText(key)).text;
            if (!text?.trim()) throw new Error("No readable content was available.");
            return text.trim();
          } catch (error) {
            errors.push(`Linked material (${item.title}): ${error instanceof Error ? error.message : "Extraction failed."}`);
            return null;
          }
        })();
        links.set(key, extraction);
      }
      const text = await links.get(key);
      if (text) texts.set(item.id, text);
    } catch {
      errors.push(`Linked material (${item.title}): Invalid source URL.`);
    }
  };

  // Keep remote work bounded even for courses containing hundreds of links.
  for (let index = 0; index < items.length; index += 4) {
    await Promise.all(items.slice(index, index + 4).map(resolve));
  }
  if (skipped) errors.push(`Linked material extraction is limited to ${MAX_LINKS_PER_CRAWL} unique URLs per course sync.`);
  return { texts, errors };
}
