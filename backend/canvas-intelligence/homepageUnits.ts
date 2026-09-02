import type { CanvasFile, CanvasPage } from "@/backend/lms/canvas";
import type { CanvasCourseUnit } from "./moduleScope";

const MAX_HTML_CHARS = 1_000_000;
const MAX_ANCHORS = 400;
const MAX_IMAGES = 80;

const STRUCTURAL_SECTION =
  /\b(unit|module|chapter|week|lesson|section|topic)\s*(?:#|no\.?\s*)?(\d+(?:\.\d+)*[a-z]?|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/i;
const REVIEW_SECTION =
  /\b(?:(?:ap|final|midterm|semester)\s+(?:exam\s+)?review|exam\s+review|review\s+materials?)\b/i;

type HtmlAttributes = Record<string, string>;

export type CanvasImageSource = {
  url: string;
  alt: string;
  /** Canvas file ID when the image is a preview/API URL rather than raw bytes. */
  fileId?: number;
};

export type CanvasHomepageImageTile = CanvasImageSource & {
  pageSlug: string;
};

export type CanvasHtmlResourceLinks = {
  pageSlugs: string[];
  assignmentIds: number[];
  fileIds: number[];
  externalUrls: string[];
  images: CanvasImageSource[];
};

function decodeHtml(value: string): string {
  const codePoint = (raw: string, radix: number) => {
    const parsed = Number.parseInt(raw, radix);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff
      ? String.fromCodePoint(parsed)
      : "";
  };
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, decimal: string) => codePoint(decimal, 10))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePoint(hex, 16));
}

function plainText(value: string): string {
  return decodeHtml(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function attributes(value: string): HtmlAttributes {
  const result: HtmlAttributes = {};
  const pattern =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of value.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    if (!name) continue;
    result[name] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

function safeUrl(value: string, domain?: string): URL | null {
  const normalized = decodeHtml(value).trim();
  if (!normalized || /^(?:javascript|data|mailto|tel):/i.test(normalized)) {
    return null;
  }
  try {
    return new URL(normalized, `https://${domain ?? "canvas.invalid"}`);
  } catch {
    return null;
  }
}

function canvasPageSlug(
  value: string,
  courseId: number,
  domain?: string
): string | null {
  const url = safeUrl(value, domain);
  if (!url) return null;
  if (domain && url.hostname.toLowerCase() !== domain.toLowerCase()) return null;
  const escapedCourseId = String(courseId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = url.pathname.match(
    new RegExp(
      `/(?:api/v1/)?courses/${escapedCourseId}/pages/(.+?)/?$`,
      "i"
    )
  );
  if (!match?.[1]) return null;
  try {
    const slug = decodeURIComponent(match[1]).trim();
    return slug && slug.length <= 512 ? slug : null;
  } catch {
    return null;
  }
}

function canvasNumericId(
  value: string,
  courseId: number,
  resource: "assignments" | "files",
  domain?: string
): number | null {
  const url = safeUrl(value, domain);
  if (!url) return null;
  if (domain && url.hostname.toLowerCase() !== domain.toLowerCase()) return null;
  const path = url.pathname;
  const coursePattern = new RegExp(
    `/(?:api/v1/)?courses/${courseId}/${resource}/(\\d+)\\b`,
    "i"
  );
  const globalFilePattern = resource === "files"
    ? /\/api\/v1\/files\/(\d+)\b/i
    : null;
  const match = path.match(coursePattern) ?? (globalFilePattern ? path.match(globalFilePattern) : null);
  const id = Number(match?.[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function canvasFileIdFromImage(value: string): number | null {
  const url = safeUrl(value);
  if (!url) return null;
  const id = Number(url.pathname.match(/\/files\/(\d+)\b/i)?.[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function resolvedCanvasImage(
  rawUrl: string,
  rawAttributes: HtmlAttributes,
  domain?: string
): CanvasImageSource | null {
  const url = safeUrl(rawUrl, domain);
  if (!url) return null;
  if (domain && url.hostname.toLowerCase() !== domain.toLowerCase()) return null;

  const width = Number(rawAttributes.width);
  const height = Number(rawAttributes.height);
  if (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0 &&
    width < 80 &&
    height < 80
  ) {
    return null;
  }

  const description = `${rawAttributes.alt ?? ""} ${rawAttributes.title ?? ""} ${url.pathname}`;
  if (/favicon|avatar|emoji|spacer|tracking[-_]?pixel|logo\.(?:png|jpe?g|gif|webp)/i.test(description)) {
    return null;
  }
  const fileId = [
    rawAttributes["data-api-endpoint"],
    rawAttributes["data-src"],
    rawAttributes.src,
    rawUrl,
  ]
    .filter(Boolean)
    .map(canvasFileIdFromImage)
    .find((id): id is number => id !== null);
  return {
    url: url.toString(),
    alt: plainText(
      rawAttributes.alt || rawAttributes.title || rawAttributes["aria-label"] || ""
    ),
    ...(fileId ? { fileId } : {}),
  };
}

export function extractCanvasImageSources(
  html: string,
  domain?: string
): CanvasImageSource[] {
  const results: CanvasImageSource[] = [];
  const seen = new Set<string>();
  const source = html.slice(0, MAX_HTML_CHARS);
  for (const match of source.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = attributes(match[1] ?? "");
    const rawUrl = attrs.src || attrs["data-src"] || attrs["data-api-endpoint"];
    if (!rawUrl) continue;
    const image = resolvedCanvasImage(rawUrl, attrs, domain);
    if (!image || seen.has(image.url)) continue;
    seen.add(image.url);
    results.push(image);
    if (results.length >= MAX_IMAGES) break;
  }
  return results;
}

export function extractCanvasHtmlResourceLinks(params: {
  html: string;
  courseId: number;
  domain?: string;
}): CanvasHtmlResourceLinks {
  const { courseId, domain } = params;
  const source = params.html.slice(0, MAX_HTML_CHARS);
  const pageSlugs = new Set<string>();
  const assignmentIds = new Set<number>();
  const fileIds = new Set<number>();
  const externalUrls = new Set<string>();

  let anchorCount = 0;
  for (const match of source.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (anchorCount++ >= MAX_ANCHORS) break;
    const attrs = attributes(match[1] ?? "");
    for (const target of [attrs["data-api-endpoint"], attrs.href].filter(Boolean)) {
      const slug = canvasPageSlug(target, courseId, domain);
      if (slug) pageSlugs.add(slug);
      const assignmentId = canvasNumericId(target, courseId, "assignments", domain);
      if (assignmentId) assignmentIds.add(assignmentId);
      const fileId = canvasNumericId(target, courseId, "files", domain);
      if (fileId) fileIds.add(fileId);

      const url = safeUrl(target, domain);
      if (
        url?.protocol === "https:" &&
        /(?:^|\.)(?:docs\.google\.com|drive\.google\.com)$/i.test(url.hostname)
      ) {
        externalUrls.add(url.toString());
      }
    }
  }

  // Google Slides/Drive are often embedded in iframes instead of anchors.
  for (const match of source.matchAll(
    /\b(?:href|src|data-src|data-api-endpoint|data)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi
  )) {
    const target = match[1] ?? match[2] ?? "";
    const assignmentId = canvasNumericId(target, courseId, "assignments", domain);
    if (assignmentId) assignmentIds.add(assignmentId);
    const fileId = canvasNumericId(target, courseId, "files", domain);
    if (fileId) fileIds.add(fileId);
    const url = safeUrl(target, domain);
    if (
      url?.protocol === "https:" &&
      /(?:^|\.)(?:docs\.google\.com|drive\.google\.com)$/i.test(url.hostname)
    ) {
      externalUrls.add(url.toString());
    }
  }

  return {
    pageSlugs: [...pageSlugs],
    assignmentIds: [...assignmentIds],
    fileIds: [...fileIds],
    externalUrls: [...externalUrls],
    images: extractCanvasImageSources(source, domain),
  };
}

function sectionLabel(candidates: string[]): string | null {
  for (const candidate of candidates) {
    const cleaned = plainText(candidate)
      .replace(/^\[?image:?\s*/i, "")
      .replace(/\.(?:png|jpe?g|gif|webp|svg)$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned || cleaned.length > 180) continue;
    if (STRUCTURAL_SECTION.test(cleaned) || REVIEW_SECTION.test(cleaned)) {
      return cleaned;
    }
  }
  return null;
}

/**
 * Discover the student-visible unit tiles on a Canvas course homepage.
 * Destination Page titles win; anchor text, image alt text, image filenames,
 * and page slugs provide deterministic fallbacks when the tile is an image.
 */
export function buildCanvasHomepageUnits(params: {
  html: string;
  courseId: number;
  domain?: string;
  pages?: readonly CanvasPage[];
  files?: readonly CanvasFile[];
  visionLabelsByPageSlug?: ReadonlyMap<string, string>;
}): CanvasCourseUnit[] {
  const pageBySlug = new Map((params.pages ?? []).map((page) => [page.url, page]));
  const fileNameById = new Map(
    (params.files ?? []).map((file) => [
      file.id,
      file.display_name || file.filename,
    ])
  );
  const results: CanvasCourseUnit[] = [];
  const seenPageSlugs = new Set<string>();
  const source = params.html.slice(0, MAX_HTML_CHARS);

  let anchorCount = 0;
  for (const match of source.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (anchorCount++ >= MAX_ANCHORS) break;
    const attrs = attributes(match[1] ?? "");
    const targets = [attrs["data-api-endpoint"], attrs.href].filter(Boolean);
    const pageSlug = targets
      .map((target) => canvasPageSlug(target, params.courseId, params.domain))
      .find((slug): slug is string => Boolean(slug));
    if (!pageSlug || seenPageSlugs.has(pageSlug)) continue;

    const innerHtml = match[2] ?? "";
    const imageCandidates: string[] = [];
    for (const imageMatch of innerHtml.matchAll(/<img\b([^>]*)>/gi)) {
      const imageAttrs = attributes(imageMatch[1] ?? "");
      imageCandidates.push(
        imageAttrs.alt ?? "",
        imageAttrs.title ?? "",
        imageAttrs["aria-label"] ?? ""
      );
      const rawImageUrl = imageAttrs.src || imageAttrs["data-src"] || imageAttrs["data-api-endpoint"];
      const fileId = rawImageUrl ? canvasFileIdFromImage(rawImageUrl) : null;
      if (fileId) imageCandidates.push(fileNameById.get(fileId) ?? "");
      if (rawImageUrl) {
        const imageUrl = safeUrl(rawImageUrl);
        const fileName = imageUrl?.pathname.split("/").pop();
        if (fileName) imageCandidates.push(fileName);
      }
    }

    const page = pageBySlug.get(pageSlug);
    const label = sectionLabel([
      page?.title ?? "",
      plainText(innerHtml),
      attrs["aria-label"] ?? "",
      attrs.title ?? "",
      ...imageCandidates,
      params.visionLabelsByPageSlug?.get(pageSlug) ?? "",
      decodeURIComponent(pageSlug),
    ]);
    if (!label) continue;

    seenPageSlugs.add(pageSlug);
    results.push({
      id: `canvas-page:${encodeURIComponent(pageSlug)}`,
      moduleId: null,
      moduleName: label,
      source: "canvas",
      itemCount: 1,
      powerpointCount: 0,
      assignmentIds: [],
      noteIds: [],
      moduleItemIds: [],
      pageSlugs: [pageSlug],
    });
  }

  return results;
}

/** Extract unique, same-course Canvas Page destinations rendered as image tiles. */
export function extractCanvasHomepageImageTiles(params: {
  html: string;
  courseId: number;
  domain?: string;
}): CanvasHomepageImageTile[] {
  const tiles: CanvasHomepageImageTile[] = [];
  const slugs = new Set<string>();
  let anchorCount = 0;
  for (const match of params.html
    .slice(0, MAX_HTML_CHARS)
    .matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (anchorCount++ >= MAX_ANCHORS) break;
    const attrs = attributes(match[1] ?? "");
    const pageSlug = [attrs["data-api-endpoint"], attrs.href]
      .filter(Boolean)
      .map((target) => canvasPageSlug(target, params.courseId, params.domain))
      .find((slug): slug is string => Boolean(slug));
    if (!pageSlug || slugs.has(pageSlug)) continue;

    const imageMatch = (match[2] ?? "").match(/<img\b([^>]*)>/i);
    if (!imageMatch) continue;
    const imageAttrs = attributes(imageMatch[1] ?? "");
    const rawUrl = imageAttrs.src || imageAttrs["data-src"] || imageAttrs["data-api-endpoint"];
    if (!rawUrl) continue;
    const image = resolvedCanvasImage(rawUrl, imageAttrs, params.domain);
    if (!image) continue;
    slugs.add(pageSlug);
    tiles.push({ pageSlug, ...image });
  }
  return tiles;
}

/** Count unique Canvas Page destinations rendered as image tiles on Home. */
export function countCanvasHomepageImagePageLinks(params: {
  html: string;
  courseId: number;
  domain?: string;
}): number {
  return extractCanvasHomepageImageTiles(params).length;
}
