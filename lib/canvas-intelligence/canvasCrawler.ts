import { createHash } from "node:crypto";
import {
  fetchCanvasAssignments,
  fetchCanvasAnnouncements,
  fetchCanvasCalendarEvents,
  fetchCanvasCourseSyllabus,
  fetchCanvasDiscussionTopics,
  fetchCanvasFileById,
  fetchCanvasFilesWide,
  fetchCanvasFolders,
  fetchCanvasModuleItems,
  fetchCanvasModules,
  fetchCanvasPageDetail,
  fetchCanvasPages,
  fetchCanvasQuizzes,
} from "@/lib/lms/canvas";
import { detectFileType, extractFileText } from "@/lib/utils/extractFileText";
import { normalizeDocumentText, stripBoilerplate } from "./documentNormalizer";
import type { CanvasContentItem, CanvasItemType, ContentEdge } from "./types";

type LinkKind =
  | "canvas_page"
  | "canvas_file"
  | "assignment"
  | "discussion"
  | "quiz"
  | "google_doc"
  | "google_slide"
  | "google_sheet"
  | "google_drive_file"
  | "video"
  | "external"
  | "unknown";

type DiscoveredLink = {
  url: string;
  text?: string | null;
  kind: LinkKind;
  relation: ContentEdge["relationType"];
  canvasId?: number | string | null;
  provider?: string | null;
};

type QueueNode = {
  url: string;
  title: string;
  fromId: string;
  depth: number;
  moduleName?: string | null;
  modulePosition?: number | null;
};

const MAX_GRAPH_DEPTH = 4;
const MAX_LINKS_PER_HTML = 80;
const MAX_FILE_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const HIGH_VALUE_TERMS = /\b(notes?|slides?|lecture|lesson|unit|chapter|study\s*guide|review|packet|worksheet|reading|handout|presentation|power\s*point|ppt)\b/i;
const LOW_VALUE_TERMS = /\b(rubric|permission|policy|calendar|schedule|attendance|office\s*hours|thumbnail|banner|avatar|logo|answer\s*key|solutions?)\b/i;

function checksum(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeCanvasDomain(domain: string): string {
  return domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function absoluteUrl(raw: string, baseUrl: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("#") || /^mailto:|^tel:|^javascript:/i.test(trimmed)) return null;
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function attrsFromTag(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[3] ?? match[4] ?? match[5] ?? "");
  }
  return attrs;
}

function extractGoogleId(url: string): string | null {
  const direct = url.match(/docs\.google\.com\/(?:document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/);
  if (direct) return direct[1];
  const drive = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (drive) return drive[1];
  const id = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return id ? id[1] : null;
}

function videoProvider(url: string): string | null {
  if (/youtu\.be|youtube\.com/i.test(url)) return "youtube";
  if (/vimeo\.com/i.test(url)) return "vimeo";
  if (/loom\.com/i.test(url)) return "loom";
  if (/edpuzzle\.com/i.test(url)) return "edpuzzle";
  if (/panopto/i.test(url)) return "panopto";
  if (/kaltura/i.test(url)) return "kaltura";
  if (/instructuremedia|canvasstudio|arcmedia/i.test(url)) return "canvas_studio";
  if (/drive\.google\.com\/file\/d\/.+\/preview/i.test(url)) return "google_drive_video";
  if (/\.(mp4|mov|webm)(\?|$)/i.test(url)) return "direct_video";
  return null;
}

function classifyLink(url: string, domain: string): Pick<DiscoveredLink, "kind" | "canvasId" | "provider"> {
  const provider = videoProvider(url);
  if (provider) return { kind: "video", provider };

  const googleId = extractGoogleId(url);
  if (/docs\.google\.com\/presentation\//i.test(url)) return { kind: "google_slide", canvasId: googleId };
  if (/docs\.google\.com\/document\//i.test(url)) return { kind: "google_doc", canvasId: googleId };
  if (/docs\.google\.com\/spreadsheets\//i.test(url)) return { kind: "google_sheet", canvasId: googleId };
  if (/drive\.google\.com/i.test(url)) return { kind: "google_drive_file", canvasId: googleId };

  try {
    const parsed = new URL(url);
    if (parsed.hostname !== domain) return { kind: "external" };
    const path = parsed.pathname;
    const page = path.match(/\/courses\/\d+\/pages\/([^/?#]+)/);
    if (page) return { kind: "canvas_page", canvasId: decodeURIComponent(page[1]) };
    const file = path.match(/\/(?:courses\/\d+\/)?files\/(\d+)/);
    if (file) return { kind: "canvas_file", canvasId: Number(file[1]) };
    const assignment = path.match(/\/courses\/\d+\/assignments\/(\d+)/);
    if (assignment) return { kind: "assignment", canvasId: Number(assignment[1]) };
    const discussion = path.match(/\/courses\/\d+\/discussion_topics\/(\d+)/);
    if (discussion) return { kind: "discussion", canvasId: Number(discussion[1]) };
    const quiz = path.match(/\/courses\/\d+\/quizzes\/(\d+)/);
    if (quiz) return { kind: "quiz", canvasId: Number(quiz[1]) };
  } catch {
    return { kind: "unknown" };
  }

  return { kind: "unknown" };
}

function parseHtmlLinks(html: string | null | undefined, baseUrl: string, domain: string): DiscoveredLink[] {
  if (!html) return [];
  const links: DiscoveredLink[] = [];
  const push = (raw: string | undefined, text: string | null, relation: ContentEdge["relationType"]) => {
    if (!raw) return;
    const url = absoluteUrl(raw, baseUrl);
    if (!url) return;
    const classified = classifyLink(url, domain);
    links.push({ url, text, relation, ...classified });
  };

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = attrsFromTag(match[1]);
    push(attrs.href, stripTags(match[2]) || attrs.title || attrs["aria-label"] || null, "links_to");
  }
  for (const match of html.matchAll(/<(iframe|embed|object)\b([^>]*)>/gi)) {
    const attrs = attrsFromTag(match[2]);
    push(attrs.src || attrs.data, attrs.title || attrs["aria-label"] || null, "embeds");
  }
  for (const match of html.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = attrsFromTag(match[1]);
    if (attrs.src) push(attrs.src, attrs.alt || attrs.title || null, "embeds");
  }
  for (const match of html.matchAll(/\bdata-(?:api-)?url\s*=\s*["']([^"']+)["']/gi)) {
    push(match[1], null, "links_to");
  }
  for (const match of html.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    push(match[0], null, "links_to");
  }

  const deduped = new Map<string, DiscoveredLink>();
  for (const link of links) {
    const key = `${link.relation}:${link.url}`;
    if (!deduped.has(key)) deduped.set(key, link);
  }
  return [...deduped.values()].slice(0, MAX_LINKS_PER_HTML);
}

function sourceTypeForFile(mimeType: string | null | undefined, fileName: string): CanvasItemType {
  const type = detectFileType(mimeType ?? "", fileName);
  if (type === "pdf") return "pdf";
  if (type === "pptx") return "pptx";
  if (type === "docx") return "docx";
  if (/^image\//i.test(mimeType ?? "")) return "image";
  return "file";
}

function sourceTypeForLink(kind: LinkKind): CanvasItemType {
  if (kind === "google_slide") return "google_slide";
  if (kind === "google_doc") return "google_doc";
  if (kind === "google_sheet") return "google_sheet";
  if (kind === "google_drive_file") return "google_drive_file";
  if (kind === "video") return "external_video";
  if (kind === "canvas_page") return "canvas_page";
  if (kind === "canvas_file") return "canvas_file";
  return "external_link";
}

function qualityScore(params: {
  title: string;
  text?: string | null;
  sourceType: CanvasItemType;
  linkedFromModule?: boolean;
  moduleName?: string | null;
  linkCount?: number;
  extractionStatus?: CanvasContentItem["extractionStatus"];
}): number {
  let score = 0.25;
  const textLength = params.text?.trim().length ?? 0;
  const basis = `${params.title} ${params.moduleName ?? ""}`;
  if (params.linkedFromModule) score += 0.2;
  if (HIGH_VALUE_TERMS.test(basis)) score += 0.25;
  if (LOW_VALUE_TERMS.test(basis)) score -= 0.25;
  if (["page", "canvas_page", "module_item", "pdf", "pptx", "docx", "google_slide", "google_doc"].includes(params.sourceType)) score += 0.15;
  if (textLength > 3000) score += 0.25;
  else if (textLength > 700) score += 0.15;
  else if (textLength > 120) score += 0.08;
  if ((params.linkCount ?? 0) > 2) score += 0.08;
  if (params.extractionStatus === "failed" || params.extractionStatus === "unsupported") score -= 0.2;
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

async function downloadAndExtractFile(params: {
  url?: string | null;
  accessToken: string;
  mimeType?: string | null;
  fileName?: string | null;
  size?: number | null;
}): Promise<{ text: string | null; status: CanvasContentItem["extractionStatus"]; error: string | null }> {
  const { url, accessToken, mimeType, fileName, size } = params;
  const fileType = detectFileType(mimeType ?? "", fileName);
  if (!fileType) return { text: null, status: "unsupported", error: "Unsupported file type" };
  if (!url) return { text: null, status: "inaccessible", error: "Missing file download URL" };
  if (size && size > MAX_FILE_DOWNLOAD_BYTES) return { text: null, status: "metadata_only", error: "File exceeds extraction size limit" };

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: "follow",
    });
    if (!res.ok) return { text: null, status: "inaccessible", error: `Download failed with ${res.status}` };
    const buffer = Buffer.from(await res.arrayBuffer());
    const text = await extractFileText(buffer, fileType);
    if (!text) return { text: null, status: "failed", error: "No readable text extracted" };
    return { text: normalizeDocumentText(stripBoilerplate(text)), status: "extracted", error: null };
  } catch (err) {
    return { text: null, status: "failed", error: (err as Error).message };
  }
}

export async function crawlCanvasCourseContent(params: {
  domain: string;
  accessToken: string;
  canvasCourseId: number;
  localCourseId: string;
}): Promise<CanvasContentItem[]> {
  const { accessToken, canvasCourseId, localCourseId } = params;
  const domain = normalizeCanvasDomain(params.domain);
  const courseBaseUrl = `https://${domain}/courses/${canvasCourseId}`;

  const [pages, assignments, files, folders, modules, discussions, quizzes, syllabus, announcements, calendarEvents] = await Promise.all([
    fetchCanvasPages(domain, accessToken, canvasCourseId),
    fetchCanvasAssignments(domain, accessToken, canvasCourseId),
    fetchCanvasFilesWide(domain, accessToken, canvasCourseId, 150),
    fetchCanvasFolders(domain, accessToken, canvasCourseId),
    fetchCanvasModules(domain, accessToken, canvasCourseId),
    fetchCanvasDiscussionTopics(domain, accessToken, canvasCourseId),
    fetchCanvasQuizzes(domain, accessToken, canvasCourseId),
    fetchCanvasCourseSyllabus(domain, accessToken, canvasCourseId),
    fetchCanvasAnnouncements(domain, accessToken, canvasCourseId),
    fetchCanvasCalendarEvents(domain, accessToken, canvasCourseId),
  ]);

  const itemsById = new Map<string, CanvasContentItem>();
  const edges: ContentEdge[] = [];
  const queue: QueueNode[] = [];
  const visitedPageSlugs = new Set<string>();
  const visitedExternalUrls = new Set<string>();
  const folderById = new Map<number, string>();
  const fileById = new Map<number, (typeof files)[number]>();

  for (const folder of folders) folderById.set(folder.id, folder.full_name ?? folder.name);
  for (const file of files) fileById.set(file.id, file);

  const addEdge = (fromNodeId: string | null | undefined, toNodeId: string, relationType: ContentEdge["relationType"]) => {
    if (!fromNodeId) return;
    const key = `${fromNodeId}:${toNodeId}:${relationType}`;
    if (!edges.some((edge) => `${edge.fromNodeId}:${edge.toNodeId}:${edge.relationType}` === key)) {
      edges.push({ fromNodeId, toNodeId, relationType });
    }
  };

  const addItem = (item: CanvasContentItem) => {
    const text = item.bodyText ?? item.textContent ?? item.fileText ?? item.bodyHtml ?? "";
    const normalizedItem: CanvasContentItem = {
      ...item,
      checksum: item.checksum ?? (text ? checksum(text) : item.sourceUrl ? checksum(item.sourceUrl) : null),
      confidenceScore: item.confidenceScore ?? 0.5,
      contentQualityScore: item.contentQualityScore ?? qualityScore({
        title: item.title,
        text,
        sourceType: item.sourceType,
        linkedFromModule: item.linkedFromModule,
        moduleName: item.moduleName,
        extractionStatus: item.extractionStatus,
      }),
      extractionStatus: item.extractionStatus ?? (text ? "extracted" : "metadata_only"),
      depth: item.depth ?? 0,
      discoveredFrom: item.discoveredFrom ?? item.linkedFrom ?? null,
      metadata: item.metadata ?? {},
    };
    const existing = itemsById.get(normalizedItem.id);
    if (!existing) {
      itemsById.set(normalizedItem.id, normalizedItem);
      return;
    }
    itemsById.set(normalizedItem.id, {
      ...existing,
      ...normalizedItem,
      linkedFromModule: existing.linkedFromModule || normalizedItem.linkedFromModule,
      bodyText: existing.bodyText ?? normalizedItem.bodyText,
      textContent: existing.textContent ?? normalizedItem.textContent,
      bodyHtml: existing.bodyHtml ?? normalizedItem.bodyHtml,
      fileText: existing.fileText ?? normalizedItem.fileText,
      metadata: { ...existing.metadata, ...normalizedItem.metadata },
    });
  };

  const enqueueLinks = (fromId: string, html: string | null | undefined, baseUrl: string, depth: number, moduleName?: string | null, modulePosition?: number | null) => {
    for (const link of parseHtmlLinks(html, baseUrl, domain)) {
      const itemId = `${sourceTypeForLink(link.kind)}_${checksum(link.url).slice(0, 16)}`;
      addEdge(fromId, itemId, link.relation);
      addItem({
        id: itemId,
        courseId: localCourseId,
        canvasCourseId,
        sourceType: sourceTypeForLink(link.kind),
        type: sourceTypeForLink(link.kind),
        title: link.text || link.provider || link.url,
        sourceUrl: link.url,
        url: link.url,
        externalUrl: link.url,
        textContent: link.kind === "video" ? `${link.provider ?? "video"} video: ${link.url}` : link.url,
        moduleName: moduleName ?? null,
        modulePosition: modulePosition ?? null,
        linkedFromModule: Boolean(moduleName),
        linkedFrom: fromId,
        discoveredFrom: fromId,
        depth: depth + 1,
        extractionStatus: link.kind === "video" ? "metadata_only" : "pending",
        confidenceScore: link.kind === "video" ? 0.45 : 0.55,
        metadata: {
          canvasObjectId: link.canvasId ?? null,
          provider: link.provider ?? null,
          linkKind: link.kind,
          videoStatus: link.kind === "video" ? "metadata_only" : null,
        },
      });

      if (depth + 1 > MAX_GRAPH_DEPTH) continue;
      if (link.kind === "canvas_page" || link.kind === "external" || link.kind === "google_doc" || link.kind === "google_slide" || link.kind === "google_sheet" || link.kind === "google_drive_file") {
        queue.push({
          url: link.url,
          title: link.text || link.url,
          fromId,
          depth: depth + 1,
          moduleName,
          modulePosition,
        });
      }
    }
  };

  for (const page of pages) {
    const detail = await fetchCanvasPageDetail(domain, accessToken, canvasCourseId, page.url);
    const pageId = `page_${page.page_id}`;
    const pageUrl = `${courseBaseUrl}/pages/${page.url}`;
    const bodyHtml = detail?.body ?? null;
    addItem({
      id: pageId,
      courseId: localCourseId,
      canvasCourseId,
      sourceType: "page",
      type: "page",
      title: page.title,
      bodyText: bodyHtml,
      html: bodyHtml,
      sourceUrl: pageUrl,
      url: pageUrl,
      bodyHtml,
      textContent: bodyHtml,
      createdAt: page.created_at ?? null,
      updatedAt: page.updated_at,
      linkedFromModule: false,
      linkedFrom: null,
      contentId: page.page_id,
      extractionStatus: bodyHtml ? "extracted" : "metadata_only",
      confidenceScore: page.front_page ? 0.85 : 0.7,
      metadata: { pageId: page.page_id, pageSlug: page.url, frontPage: page.front_page ?? false },
    });
    visitedPageSlugs.add(page.url);
    enqueueLinks(pageId, bodyHtml, pageUrl, 0);
  }

  for (const assignment of assignments) {
    const assignmentId = `assignment_${assignment.id}`;
    const links = parseHtmlLinks(assignment.description ?? null, assignment.html_url, domain);
    addItem({
      id: assignmentId,
      courseId: localCourseId,
      canvasCourseId,
      sourceType: "assignment",
      type: "assignment",
      title: assignment.name,
      sourceUrl: assignment.html_url,
      url: assignment.html_url,
      html: assignment.description ?? null,
      bodyHtml: assignment.description ?? null,
      bodyText: assignment.description ?? null,
      textContent: assignment.description ?? null,
      updatedAt: assignment.unlock_at ?? assignment.due_at ?? null,
      dueAt: assignment.due_at,
      dueDate: assignment.due_at,
      linkedFromModule: false,
      linkedFrom: null,
      contentId: assignment.id,
      extractionStatus: assignment.description ? "extracted" : "metadata_only",
      confidenceScore: 0.55,
      metadata: { submissionTypes: assignment.submission_types, embeddedLinks: links.map((link) => link.url) },
    });
    enqueueLinks(assignmentId, assignment.description ?? null, assignment.html_url, 0);
  }

  for (const file of files) {
    const mimeType = file["content-type"] ?? file.content_type ?? "";
    const fileName = file.filename ?? file.display_name;
    const extraction = await downloadAndExtractFile({
      url: file.url,
      accessToken,
      mimeType,
      fileName,
      size: file.size,
    });
    const sourceType = sourceTypeForFile(mimeType, fileName);
    const folderId = (file as unknown as { folder_id?: number }).folder_id;
    addItem({
      id: `file_${file.id}`,
      courseId: localCourseId,
      canvasCourseId,
      sourceType,
      type: sourceType,
      title: file.display_name,
      bodyText: extraction.text,
      textContent: extraction.text,
      fileText: extraction.text,
      sourceUrl: file.url,
      url: file.url,
      folderPath: folderId ? folderById.get(folderId) ?? null : null,
      createdAt: file.created_at,
      updatedAt: file.updated_at,
      linkedFromModule: false,
      linkedFrom: null,
      fileMimeType: mimeType,
      fileSize: file.size,
      contentId: file.id,
      extractionStatus: extraction.status,
      errorMessage: extraction.error,
      confidenceScore: HIGH_VALUE_TERMS.test(`${file.display_name} ${fileName}`) ? 0.75 : 0.55,
      metadata: { fileName, folderId: folderId ?? null },
    });
  }

  for (const module of modules) {
    const moduleId = `module_${module.id}`;
    addItem({
      id: moduleId,
      courseId: localCourseId,
      canvasCourseId,
      sourceType: "module",
      type: "module",
      title: module.name,
      textContent: module.name,
      sourceUrl: `${courseBaseUrl}/modules`,
      url: `${courseBaseUrl}/modules`,
      moduleName: module.name,
      modulePosition: module.position,
      linkedFromModule: true,
      linkedFrom: null,
      contentId: module.id,
      extractionStatus: "metadata_only",
      confidenceScore: 0.65,
      metadata: { moduleId: module.id, itemsCount: module.items_count },
    });

    const moduleItems = await fetchCanvasModuleItems(domain, accessToken, canvasCourseId, module.id);
    for (const moduleItem of moduleItems) {
      let moduleItemText: string | null = null;
      let extractionStatus: CanvasContentItem["extractionStatus"] = "metadata_only";
      let errorMessage: string | null = null;
      const itemId = `module_item_${moduleItem.id}`;

      if (moduleItem.type === "Page" && moduleItem.page_url) {
        const detail = await fetchCanvasPageDetail(domain, accessToken, canvasCourseId, moduleItem.page_url);
        moduleItemText = detail?.body ?? null;
        extractionStatus = moduleItemText ? "extracted" : "metadata_only";
        if (detail?.body) enqueueLinks(itemId, detail.body, `${courseBaseUrl}/pages/${moduleItem.page_url}`, 1, module.name, module.position);
      }

      if (moduleItem.type === "File" && moduleItem.content_id) {
        const fileMeta = fileById.get(moduleItem.content_id) ?? await fetchCanvasFileById(domain, accessToken, canvasCourseId, moduleItem.content_id);
        const mimeType = moduleItem.content_details?.["content-type"] ?? fileMeta?.["content-type"] ?? fileMeta?.content_type ?? "";
        const fileName = fileMeta?.filename ?? fileMeta?.display_name ?? moduleItem.title;
        const extraction = await downloadAndExtractFile({
          url: moduleItem.content_details?.url ?? fileMeta?.url,
          accessToken,
          mimeType,
          fileName,
          size: moduleItem.content_details?.size ?? fileMeta?.size,
        });
        moduleItemText = extraction.text;
        extractionStatus = extraction.status;
        errorMessage = extraction.error;
        if (fileMeta) addEdge(moduleId, `file_${fileMeta.id}`, "belongs_to_module");
      }

      if (!moduleItemText && moduleItem.external_url) {
        const link = classifyLink(moduleItem.external_url, domain);
        extractionStatus = link.kind === "video" ? "metadata_only" : "pending";
        queue.push({ url: moduleItem.external_url, title: moduleItem.title, fromId: itemId, depth: 1, moduleName: module.name, modulePosition: module.position });
      }

      addItem({
        id: itemId,
        courseId: localCourseId,
        canvasCourseId,
        sourceType: "module_item",
        type: "module_item",
        title: moduleItem.title,
        sourceUrl: moduleItem.html_url,
        url: moduleItem.html_url,
        externalUrl: moduleItem.external_url,
        bodyText: moduleItemText,
        textContent: moduleItemText,
        fileText: moduleItemText,
        moduleName: module.name,
        modulePosition: module.position,
        itemPosition: moduleItem.position,
        linkedFromModule: true,
        linkedFrom: moduleId,
        discoveredFrom: moduleId,
        contentId: moduleItem.content_id,
        extractionStatus,
        errorMessage,
        confidenceScore: 0.82,
        metadata: {
          moduleId: module.id,
          itemType: moduleItem.type,
          pageUrl: moduleItem.page_url,
          contentDetails: moduleItem.content_details ?? null,
        },
      });
      addEdge(moduleId, itemId, "belongs_to_module");
    }
  }

  if (syllabus) {
    const syllabusId = `syllabus_${canvasCourseId}`;
    addItem({
      id: syllabusId,
      courseId: localCourseId,
      canvasCourseId,
      sourceType: "syllabus",
      type: "syllabus",
      title: "Course Syllabus",
      bodyText: syllabus,
      textContent: syllabus,
      sourceUrl: `${courseBaseUrl}/assignments/syllabus`,
      url: `${courseBaseUrl}/assignments/syllabus`,
      linkedFromModule: false,
      linkedFrom: null,
      extractionStatus: "extracted",
      confidenceScore: 0.45,
      metadata: {},
    });
    enqueueLinks(syllabusId, syllabus, `${courseBaseUrl}/assignments/syllabus`, 0);
  }

  for (const announcement of announcements) {
    const announcementId = `announcement_${announcement.id}`;
    addItem({
      id: announcementId,
      courseId: localCourseId,
      canvasCourseId,
      sourceType: "announcement",
      type: "announcement",
      title: announcement.title,
      bodyText: announcement.message ?? null,
      html: announcement.message ?? null,
      bodyHtml: announcement.message ?? null,
      textContent: announcement.message ?? null,
      sourceUrl: announcement.html_url ?? null,
      url: announcement.html_url ?? null,
      createdAt: announcement.posted_at ?? null,
      updatedAt: announcement.delayed_post_at ?? announcement.posted_at ?? null,
      linkedFromModule: false,
      linkedFrom: null,
      extractionStatus: announcement.message ? "extracted" : "metadata_only",
      confidenceScore: 0.38,
      metadata: {},
    });
    enqueueLinks(announcementId, announcement.message ?? null, announcement.html_url ?? courseBaseUrl, 0);
  }

  for (const discussion of discussions) {
    const discussionBody = (discussion as typeof discussion & { message?: string }).message ?? null;
    addItem({
      id: `discussion_${discussion.id}`,
      courseId: localCourseId,
      canvasCourseId,
      sourceType: "discussion",
      type: "discussion",
      title: discussion.title,
      bodyText: discussionBody,
      bodyHtml: discussionBody,
      textContent: discussionBody,
      sourceUrl: discussion.html_url,
      url: discussion.html_url,
      updatedAt: discussion.updated_at,
      linkedFromModule: false,
      linkedFrom: null,
      extractionStatus: discussionBody ? "extracted" : "metadata_only",
      confidenceScore: 0.4,
      metadata: { discussionType: discussion.discussion_type },
    });
  }

  for (const quiz of quizzes) {
    addItem({
      id: `quiz_${quiz.id}`,
      courseId: localCourseId,
      canvasCourseId,
      sourceType: "quiz",
      type: "quiz",
      title: quiz.title,
      sourceUrl: quiz.html_url,
      url: quiz.html_url,
      dueAt: quiz.due_at,
      dueDate: quiz.due_at,
      updatedAt: quiz.unlock_at ?? quiz.due_at ?? null,
      linkedFromModule: false,
      linkedFrom: null,
      extractionStatus: "metadata_only",
      confidenceScore: 0.25,
      metadata: { points: quiz.points_possible, questions: quiz.question_count, answerLeakageGuard: true },
    });
  }

  for (const event of calendarEvents) {
    const eventId = `calendar_${event.id}`;
    addItem({
      id: eventId,
      courseId: localCourseId,
      canvasCourseId,
      sourceType: "calendar_event",
      type: "calendar_event",
      title: event.title,
      bodyText: event.description ?? null,
      html: event.description ?? null,
      bodyHtml: event.description ?? null,
      textContent: event.description ?? null,
      sourceUrl: event.html_url ?? null,
      url: event.html_url ?? null,
      createdAt: event.start_at ?? null,
      updatedAt: event.updated_at ?? event.end_at ?? event.start_at ?? null,
      dueAt: event.start_at ?? null,
      dueDate: event.start_at ?? null,
      linkedFromModule: false,
      linkedFrom: null,
      extractionStatus: event.description ? "extracted" : "metadata_only",
      confidenceScore: 0.28,
      metadata: { contextCode: event.context_code, endAt: event.end_at },
    });
    enqueueLinks(eventId, event.description ?? null, event.html_url ?? courseBaseUrl, 0);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth > MAX_GRAPH_DEPTH) continue;
    const classified = classifyLink(current.url, domain);
    const visitKey = `${classified.kind}:${current.url}`;
    if (visitedExternalUrls.has(visitKey)) continue;
    visitedExternalUrls.add(visitKey);

    if (classified.kind === "canvas_page" && typeof classified.canvasId === "string" && !visitedPageSlugs.has(classified.canvasId)) {
      const detail = await fetchCanvasPageDetail(domain, accessToken, canvasCourseId, classified.canvasId);
      if (detail) {
        visitedPageSlugs.add(classified.canvasId);
        const pageId = `page_${detail.page_id}`;
        addEdge(current.fromId, pageId, "links_to");
        addItem({
          id: pageId,
          courseId: localCourseId,
          canvasCourseId,
          sourceType: "page",
          type: "page",
          title: detail.title,
          bodyText: detail.body ?? null,
          html: detail.body ?? null,
          bodyHtml: detail.body ?? null,
          textContent: detail.body ?? null,
          sourceUrl: `${courseBaseUrl}/pages/${detail.url}`,
          url: `${courseBaseUrl}/pages/${detail.url}`,
          createdAt: detail.created_at ?? null,
          updatedAt: detail.updated_at,
          moduleName: current.moduleName ?? null,
          modulePosition: current.modulePosition ?? null,
          linkedFromModule: Boolean(current.moduleName),
          linkedFrom: current.fromId,
          discoveredFrom: current.fromId,
          depth: current.depth,
          contentId: detail.page_id,
          extractionStatus: detail.body ? "extracted" : "metadata_only",
          confidenceScore: 0.72,
          metadata: { pageId: detail.page_id, pageSlug: detail.url, traversedFromLink: true },
        });
        enqueueLinks(pageId, detail.body ?? null, `${courseBaseUrl}/pages/${detail.url}`, current.depth, current.moduleName, current.modulePosition);
      }
    }

    if (classified.kind === "canvas_file" && typeof classified.canvasId === "number") {
      const fileMeta = fileById.get(classified.canvasId) ?? await fetchCanvasFileById(domain, accessToken, canvasCourseId, classified.canvasId);
      if (fileMeta) addEdge(current.fromId, `file_${fileMeta.id}`, "attached_file");
    }
  }

  const graphEdgesByNode = new Map<string, ContentEdge[]>();
  for (const edge of edges) {
    graphEdgesByNode.set(edge.fromNodeId, [...(graphEdgesByNode.get(edge.fromNodeId) ?? []), edge]);
    graphEdgesByNode.set(edge.toNodeId, [...(graphEdgesByNode.get(edge.toNodeId) ?? []), edge]);
  }

  return [...itemsById.values()].map((item) => ({
    ...item,
    metadata: {
      ...item.metadata,
      graphEdges: graphEdgesByNode.get(item.id) ?? [],
      graphEdgeCount: graphEdgesByNode.get(item.id)?.length ?? 0,
    },
  })).sort((a, b) => (b.contentQualityScore ?? 0) - (a.contentQualityScore ?? 0));
}
