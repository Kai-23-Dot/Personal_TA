/**
 * canvasDeepFetch — Exhaustive Canvas content retrieval + topic ranking
 *
 * Algorithm:
 *   1. Load already-synced notes + assignments from Supabase (fast)
 *   2. If Canvas is connected, deep-crawl live content:
 *      a. Fetch modules (build module→page map + score each module vs. topic)
 *      b. Fetch all pages: prioritise module-matched pages, then keyword-title pages
 *      c. Fetch page bodies (cap = MAX_PAGE_BODY_FETCHES, module-matched pages first)
 *      d. Fetch Canvas files listing → download bodies of topic-relevant files
 *      e. Add live assignments not yet in DB
 *   3. Merge all content → chunk → embed → multi-signal rank
 *   4. If no direct topic content, produce styleHint for style-matched generation
 */

import { createServiceClient } from "@/backend/supabase/server";
import {
  fetchCanvasModules,
  fetchCanvasModuleItems,
  fetchCanvasPages,
  fetchCanvasFrontPage,
  fetchCanvasAssignments,
  fetchCanvasPageBody,
  fetchCanvasPageDetail,
  fetchCanvasFilesWide,
  fetchCanvasFileById,
  downloadCanvasFile,
  htmlToPlainText,
} from "@/backend/lms/canvas";
import { getCanvasCourseContext } from "@/backend/lms/canvasConnection";
import { detectFileType, extractFileText } from "@/backend/utils/extractFileText";
import {
  extractTextFromImages,
  type ImageMediaType,
} from "@/backend/ai/ocrImage";
import { classifyContent } from "./contentClassifier";
import { chunkDocument } from "./chunker";
import { scoreConfidence } from "./confidenceScorer";
import { embedTexts, cosineSimilarity } from "./embeddingIndexer";
import {
  dateProximityScore,
  scoreChunk,
  keywordScore,
  fuzzyTitleScore,
} from "./rankingModel";
import { explainSourceChoice } from "./sourceExplainer";
import {
  buildCanvasCourseUnits,
  buildModuleAwarePageInventory,
  buildSelectedModuleFileInventory,
  extractCanvasLinkedResourceIds,
  scopeCanvasModuleGroups,
} from "./moduleScope";
import type { CanvasUnitScope } from "./moduleScope";
import {
  buildCanvasHomepageUnits,
  extractCanvasHtmlResourceLinks,
} from "./homepageUnits";
import { extractFromGoogleLink } from "./contentExtractor";
import { selectBalancedModuleSources } from "@/backend/practice/moduleSources";
import type {
  CanvasContentItem,
  DocumentChunk,
  ExtractedDocument,
  RankedSource,
} from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Max live page body fetches per call. Module-matched pages are fetched first. */
const MAX_PAGE_BODY_FETCHES = 50;
/** Max Canvas file downloads per call (topic-relevant files only). */
const MAX_FILE_DOWNLOADS = 8;
/** Max file size to download (bytes). */
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
/** Max chunks passed to the embedding + ranking step. */
const MAX_CANDIDATE_CHUNKS = 80;
/** Max modules to load items from. */
const MAX_MODULES_FOR_ITEM_FETCH = 40;
/** Bounded recursive crawl for courses whose units live on the Home page. */
const MAX_HOMEPAGE_PAGES_PER_UNIT = 12;
const MAX_HOMEPAGE_PAGES_TOTAL = 48;
const MAX_HOMEPAGE_LINK_DEPTH = 2;
/** One batched vision call keeps image-heavy math units within route latency. */
const MAX_VISION_IMAGES = 12;
const MAX_VISION_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_MEDIA_TYPES: Record<string, ImageMediaType> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

const HIGH_VALUE_FILE_TERMS =
  /\b(notes?|slides?|lecture|lesson|unit|chapter|study\s*guide|review|packet|worksheet|reading|handout|presentation|powerpoint|ppt|pdf)\b/i;

async function canvasCollectionOrFallback<T>(
  label: string,
  request: Promise<T>,
  fallback: T,
  warnings: string[]
): Promise<T> {
  try {
    return await request;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Canvas request failed.";
    warnings.push(`${label}: ${message}`);
    console.warn(`[CanvasDeepFetch] ${label} unavailable: ${message}`);
    return fallback;
  }
}

type HomepagePageDetail = NonNullable<
  Awaited<ReturnType<typeof fetchCanvasPageDetail>>
>;

type CrawledHomepagePage = {
  detail: HomepagePageDetail;
  unitName: string;
  depth: number;
  links: ReturnType<typeof extractCanvasHtmlResourceLinks>;
};

/**
 * Follow only same-course Canvas Page links starting at the selected Home
 * tiles. The crawl is breadth-first, bounded per unit and globally, and never
 * crosses into another unit's root page.
 */
async function crawlCanvasHomepageUnits(params: {
  domain: string;
  accessToken: string;
  canvasCourseId: number;
  scopes: ReadonlyArray<{ unitName: string; pageSlugs: readonly string[] }>;
  allUnitRootSlugs?: readonly string[];
  warnings: string[];
}): Promise<CrawledHomepagePage[]> {
  const { domain, accessToken, canvasCourseId, scopes, warnings } = params;
  const allRootSlugs = new Set([
    ...(params.allUnitRootSlugs ?? []),
    ...scopes.flatMap((scope) => scope.pageSlugs),
  ]);
  const seenByUnit = new Map<string, Set<string>>();
  const queue: Array<{ unitName: string; slug: string; depth: number; rootSlug: string }> = [];

  for (const scope of scopes) {
    const seen = seenByUnit.get(scope.unitName) ?? new Set<string>();
    seenByUnit.set(scope.unitName, seen);
    for (const slug of scope.pageSlugs) {
      if (seen.has(slug) || seen.size >= MAX_HOMEPAGE_PAGES_PER_UNIT) continue;
      seen.add(slug);
      queue.push({ unitName: scope.unitName, slug, depth: 0, rootSlug: slug });
    }
  }

  const crawled: CrawledHomepagePage[] = [];
  while (queue.length > 0 && crawled.length < MAX_HOMEPAGE_PAGES_TOTAL) {
    const remaining = MAX_HOMEPAGE_PAGES_TOTAL - crawled.length;
    const batch = queue.splice(0, Math.min(12, remaining));
    const details = await Promise.all(
      batch.map(({ slug }) =>
        fetchCanvasPageDetail(domain, accessToken, canvasCourseId, slug)
      )
    );

    for (let index = 0; index < batch.length; index++) {
      const queued = batch[index];
      const detail = details[index];
      if (!detail) {
        if (queued.depth === 0) {
          warnings.push(`${queued.unitName}: Canvas page "${queued.slug}" could not be opened.`);
        }
        continue;
      }
      const links = extractCanvasHtmlResourceLinks({
        html: detail.body ?? "",
        courseId: canvasCourseId,
        domain,
      });
      crawled.push({ detail, unitName: queued.unitName, depth: queued.depth, links });

      if (queued.depth >= MAX_HOMEPAGE_LINK_DEPTH) continue;
      const seen = seenByUnit.get(queued.unitName) ?? new Set<string>();
      seenByUnit.set(queued.unitName, seen);
      for (const slug of links.pageSlugs) {
        if (seen.has(slug) || seen.size >= MAX_HOMEPAGE_PAGES_PER_UNIT) continue;
        if (allRootSlugs.has(slug) && slug !== queued.rootSlug) continue;
        seen.add(slug);
        queue.push({
          unitName: queued.unitName,
          slug,
          depth: queued.depth + 1,
          rootSlug: queued.rootSlug,
        });
      }
    }
  }

  return crawled;
}

// ── Local DB row types ────────────────────────────────────────────────────────

type NoteRow = {
  id: string;
  course_id: string | null;
  title: string;
  content: string | null;
  source_url: string | null;
  source_file_id: string | null;
  updated_at: string;
  file_type: string | null;
  unit_name: string | null;
  exam_name: string | null;
};

type AssignmentRow = {
  id: string;
  course_id: string;
  platform_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  updated_at: string;
};

// ── Helper converters ─────────────────────────────────────────────────────────

function noteToContentItem(note: NoteRow): CanvasContentItem {
  return {
    id: note.id,
    courseId: note.course_id ?? "",
    canvasCourseId: 0,
    sourceType: "file",
    type: "file",
    title: note.title,
    bodyText: note.content,
    sourceUrl: note.source_url,
    url: note.source_url,
    textContent: note.content,
    updatedAt: note.updated_at,
    linkedFromModule:
      (note.source_file_id ?? "").startsWith("canvas_page_") ||
      (note.source_file_id ?? "").startsWith("canvas_file_"),
    linkedFrom: null,
    metadata: {
      sourceFileId: note.source_file_id,
      fileType: note.file_type,
      unit: note.unit_name,
      exam: note.exam_name,
    },
  };
}

function assignmentRowToContentItem(a: AssignmentRow): CanvasContentItem {
  return {
    id: a.id,
    courseId: a.course_id,
    canvasCourseId: 0,
    sourceType: "assignment",
    type: "assignment",
    title: a.title,
    bodyText: a.description,
    textContent: a.description,
    dueAt: a.due_date,
    dueDate: a.due_date,
    updatedAt: a.updated_at,
    linkedFromModule: false,
    linkedFrom: null,
    metadata: { platformId: a.platform_id },
  };
}

/**
 * Returns true if a chunk's text is purely quiz/assessment logistics metadata
 * (time limits, point values, question counts, attempt rules) with no subject content.
 * These chunks would cause the AI to generate questions about assessment mechanics
 * instead of the actual subject matter.
 */
function isLogisticsChunk(text: string): boolean {
  const t = text.trim();
  if (t.length > 600) return false; // real content is longer than this
  const LOGISTICS_SIGNAL =
    /\b(time\s*limit\s*[:=]|allowed\s*attempts?\s*[:=]|points?\s*[:=]\s*\d|quiz\s*type\s*[:=]|access\s*code\s*[:=]|available\s*(from|until)\s*[:=]|due\s*(date|at)\s*[:=]|attempt\s*(limit|type)\s*[:=]|score\s*to\s*pass|lock\s*questions?\s*after|show\s*(results|correct\s*answers))\b/gi;
  const hits = (t.match(LOGISTICS_SIGNAL) ?? []).length;
  return hits >= 2; // two or more logistics fields → pure metadata
}

function toExtractedDoc(item: CanvasContentItem): ExtractedDocument | null {
  const content = (item.textContent ?? item.bodyText ?? "").trim();
  if (!content) return null;
  const classified = classifyContent(item, content);
  return {
    id: `doc_${item.id}`,
    itemId: item.id,
    courseId: item.courseId,
    title: item.title,
    sourceType: item.sourceType,
    sourceUrl: item.sourceUrl,
    updatedAt: item.updatedAt,
    moduleName: item.moduleName,
    dueAt: item.dueAt,
    content,
    normalizedContent: content,
    category: classified.category,
    tags: classified.tags,
    metadata: {
      ...item.metadata,
      linkedFromModule: item.linkedFromModule,
      linkedFrom: item.linkedFrom ?? null,
      sourceType: item.sourceType,
      contentId: item.contentId ?? null,
    },
  };
}

// ── Module ↔ topic matching ───────────────────────────────────────────────────

/**
 * Returns a 0–1 score for how well a Canvas module name matches the topic.
 * Uses both substring containment and word-level overlap.
 */
function moduleTopicScore(moduleName: string, topicWords: string[]): number {
  const m = moduleName.toLowerCase();
  const t = topicWords.join(" ");

  // Full phrase containment (e.g. module "Unit 2: Napoleon" matches topic "Napoleon")
  if (m.includes(t) || t.includes(m)) return 1;

  // Word-level overlap
  const mWords = m.split(/\W+/).filter((w) => w.length > 2);
  const hits = topicWords.filter((tw) =>
    mWords.some((mw) => mw.includes(tw) || tw.includes(mw))
  ).length;
  if (hits === 0) return 0;
  return Math.min(1, hits / Math.max(1, topicWords.length) * 1.5);
}

// ── File download helper ──────────────────────────────────────────────────────

async function downloadFileText(
  domain: string,
  url: string,
  accessToken: string,
  mimeType: string,
  fileName: string,
  size: number | null
): Promise<string | null> {
  const fileType = detectFileType(mimeType, fileName);
  if (!fileType) return null;
  if (size && size > MAX_FILE_BYTES) return null;
  try {
    const { buffer } = await downloadCanvasFile(
      domain,
      accessToken,
      url,
      MAX_FILE_BYTES
    );
    const text = await extractFileText(buffer, fileType);
    return text ?? null;
  } catch {
    return null;
  }
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface CanvasDeepFetchResult {
  ranked: RankedSource[];
  confidence: ReturnType<typeof scoreConfidence>;
  /** True when at least one ranked source has confidence ≥ 0.3. */
  hasDirectContent: boolean;
  /**
   * Representative snippet of course material for style inference.
   * Only set when hasDirectContent is false.
   */
  styleHint?: string;
  /** All module names found in the course (Canvas order). */
  moduleNames: string[];
  /** Live Canvas resources that could not be refreshed; stored content may still be used. */
  warnings: string[];
}

// ── Core algorithm ────────────────────────────────────────────────────────────

export async function canvasDeepFetch(params: {
  userId: string;
  courseId: string;
  topic: string;
  moduleId?: number;
  moduleName?: string;
  moduleIds?: readonly number[];
  moduleNames?: readonly string[];
  unitScopes?: readonly CanvasUnitScope[];
  limit?: number;
  testDate?: string;
}): Promise<CanvasDeepFetchResult> {
  const {
    userId,
    courseId,
    topic,
    moduleId,
    moduleName,
    moduleIds = [],
    moduleNames: requestedModuleNames = [],
    unitScopes = [],
    limit = 12,
    testDate,
  } = params;
  const supabase = createServiceClient();
  const requestedModuleIdSet = new Set<number>([
    ...moduleIds,
    ...(moduleId === undefined ? [] : [moduleId]),
    ...unitScopes
      .map((scope) => scope.moduleId)
      .filter((id): id is number => id !== null),
  ]);
  const requestedModuleNameKeys = new Set(
    [...requestedModuleNames, ...(moduleName ? [moduleName] : [])]
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean)
  );

  // Precompute topic words once (used throughout)
  const topicWords = topic
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);

  // ── Step 1: Load DB-synced content ────────────────────────────────────────
  const [
    canvasContext,
    { data: dbNotes },
    { data: dbAssignments },
  ] = await Promise.all([
    getCanvasCourseContext(supabase, userId, courseId),
    supabase
      .from("notes")
      .select(
        "id, course_id, title, content, source_url, source_file_id, updated_at, file_type, unit_name, exam_name"
      )
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .not("content", "is", null)
      .order("updated_at", { ascending: false })
      .limit(150),
    supabase
      .from("assignments")
      .select("id, course_id, platform_id, title, description, due_date, updated_at")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .not("description", "is", null)
      .order("updated_at", { ascending: false })
      .limit(60),
  ]);
  const connection = canvasContext?.connection;
  const course = canvasContext?.course;

  const contentItems: CanvasContentItem[] = [
    ...((dbNotes ?? []) as NoteRow[]).map(noteToContentItem),
    ...((dbAssignments ?? []) as AssignmentRow[]).map(assignmentRowToContentItem),
  ];

  const moduleNames: string[] = [];
  const warnings: string[] = [];
  let resolvedSelectedModuleNames = new Set(
    [
      ...unitScopes.map((scope) => scope.unitName),
      ...requestedModuleNames,
      ...(moduleName ? [moduleName] : []),
    ]
      .map((name) => name.trim())
      .filter(Boolean)
  );

  // ── Step 2: Live Canvas deep-crawl ────────────────────────────────────────
  if (connection?.access_token && connection.canvas_domain && course?.platform_id) {
    const canvasCourseId = Number(course.platform_id);
    if (Number.isFinite(canvasCourseId)) {
      const { access_token, canvas_domain } = connection;

      // Track already-synced page IDs (so we don't add duplicate body text)
      const syncedPageSourceIds = new Set(
        (dbNotes ?? [])
          .map((n) => n.source_file_id)
          .filter(
            (id): id is string =>
              typeof id === "string" && id.startsWith("canvas_page_")
          )
          .map((id) => id.match(/_(\d+)$/)?.[1])
          .filter((id): id is string => Boolean(id))
      );
      const syncedAssignmentTitles = new Set(
        (dbAssignments ?? []).map((a) => a.title)
      );

      // Parallel Canvas API calls
      const [modules, pages, liveAssignments, files, frontPage] = await Promise.all([
        canvasCollectionOrFallback(
          "modules",
          fetchCanvasModules(canvas_domain, access_token, canvasCourseId),
          [],
          warnings
        ),
        canvasCollectionOrFallback(
          "pages",
          fetchCanvasPages(canvas_domain, access_token, canvasCourseId),
          [],
          warnings
        ),
        canvasCollectionOrFallback(
          "assignments",
          fetchCanvasAssignments(canvas_domain, access_token, canvasCourseId),
          [],
          warnings
        ),
        canvasCollectionOrFallback(
          "files",
          fetchCanvasFilesWide(canvas_domain, access_token, canvasCourseId, 200),
          [],
          warnings
        ),
        fetchCanvasFrontPage(canvas_domain, access_token, canvasCourseId),
      ]);

      moduleNames.push(...modules.map((m) => m.name));

      // ── 2a: Fetch module items → build page→module map ──────────────────
      const requestedModules = modules.filter(
        (module) =>
          requestedModuleIdSet.has(module.id) ||
          requestedModuleNameKeys.has(module.name.trim().toLowerCase())
      );
      const requestedModuleIds = new Set(requestedModules.map((module) => module.id));
      // Always include the explicitly selected module, even in courses with
      // more modules than the crawl cap.
      const moduleSlice = [
        ...requestedModules,
        ...modules.filter((module) => !requestedModuleIds.has(module.id)),
      ].slice(0, MAX_MODULES_FOR_ITEM_FETCH);
      const moduleItemsResults = await Promise.all(
        moduleSlice.map((m) =>
          fetchCanvasModuleItems(canvas_domain, access_token, canvasCourseId, m.id)
            .then((items) => ({ module: m, items }))
            .catch((error: unknown) => {
              const message = error instanceof Error ? error.message : "Canvas request failed.";
              warnings.push(`module ${m.id}: ${message}`);
              return {
                module: m,
                items: [] as Awaited<ReturnType<typeof fetchCanvasModuleItems>>,
              };
            })
        )
      );

      // A Canvas course may use one broad module as a folder and put its real
      // Unit 1, Unit 2, ... boundaries in the item titles. Expose those names
      // alongside native modules and scope selected synthetic units precisely.
      for (const unit of buildCanvasCourseUnits(moduleItemsResults)) {
        if (!moduleNames.includes(unit.moduleName)) moduleNames.push(unit.moduleName);
      }
      const homepageUnits = frontPage?.body
        ? buildCanvasHomepageUnits({
            html: frontPage.body,
            courseId: canvasCourseId,
            domain: canvas_domain,
            pages,
            files,
          })
        : [];
      for (const unit of homepageUnits) {
        if (!moduleNames.includes(unit.moduleName)) moduleNames.push(unit.moduleName);
      }

      const homepageUnitByName = new Map(
        homepageUnits.map((unit) => [
          unit.moduleName.trim().toLowerCase(),
          unit,
        ])
      );
      const selectedHomepageScopes = unitScopes.flatMap((scope) => {
        const discovered = homepageUnitByName.get(
          scope.unitName.trim().toLowerCase()
        );
        const pageSlugs = [
          ...new Set([
            ...(scope.pageSlugs ?? []),
            ...(discovered?.pageSlugs ?? []),
          ]),
        ];
        return pageSlugs.length > 0
          ? [{ unitName: scope.unitName, pageSlugs }]
          : [];
      });
      for (const unit of homepageUnits) {
        const key = unit.moduleName.trim().toLowerCase();
        if (
          requestedModuleNameKeys.has(key) &&
          !selectedHomepageScopes.some(
            (scope) => scope.unitName.trim().toLowerCase() === key
          )
        ) {
          selectedHomepageScopes.push({
            unitName: unit.moduleName,
            pageSlugs: unit.pageSlugs,
          });
        }
      }

      const selectedCanvasModuleIds = new Set(
        requestedModules.map((module) => module.id)
      );
      const exactScopedModuleIds = new Set(
        unitScopes
          .map((scope) => scope.moduleId)
          .filter((id): id is number => id !== null)
      );
      const exactScopedResults = scopeCanvasModuleGroups(
        moduleItemsResults,
        unitScopes
      );
      const legacySelectedResults = moduleItemsResults.filter(
        ({ module }) =>
          selectedCanvasModuleIds.has(module.id) &&
          !exactScopedModuleIds.has(module.id)
      );
      const selectedModuleResults = unitScopes.length > 0
        ? [...exactScopedResults, ...legacySelectedResults]
        : moduleItemsResults.filter(({ module }) =>
            selectedCanvasModuleIds.has(module.id)
          );
      const selectedStructureNames = [
        ...selectedModuleResults.map(({ module }) => module.name),
        ...selectedHomepageScopes.map((scope) => scope.unitName),
      ];
      const hasExactUnitSelection = selectedStructureNames.length > 0;
      if (hasExactUnitSelection) {
        resolvedSelectedModuleNames = new Set(
          selectedStructureNames
        );
      }
      const selectedModuleFileIds = new Set(
        selectedModuleResults
          .flatMap(({ items }) => items
            .filter((item) => item.type === "File" && item.content_id)
            .map((item) => String(item.content_id)))
      );
      const selectedModuleAssignmentIds = new Set(
        selectedModuleResults
          .flatMap(({ items }) => items
            .filter((item) => item.type === "Assignment" && item.content_id)
            .map((item) => String(item.content_id)))
      );
      const selectedFileModuleNames = new Map<string, string>();
      const selectedAssignmentModuleNames = new Map<string, string>();
      const selectedPageModuleNames = new Map<string, string>();
      for (const { module, items } of selectedModuleResults) {
        for (const item of items) {
          if (item.type === "Page") {
            selectedPageModuleNames.set(
              String(item.content_id ?? item.id),
              module.name
            );
          }
          if (item.type === "File" && item.content_id) {
            selectedFileModuleNames.set(String(item.content_id), module.name);
          }
          if (item.type === "Assignment" && item.content_id) {
            selectedAssignmentModuleNames.set(
              String(item.content_id),
              module.name
            );
          }
        }
      }

      const crawledHomepagePages = await crawlCanvasHomepageUnits({
        domain: canvas_domain,
        accessToken: access_token,
        canvasCourseId,
        scopes: selectedHomepageScopes,
        allUnitRootSlugs: homepageUnits.flatMap((unit) => unit.pageSlugs),
        warnings,
      });
      const selectedHomepagePageSlugs = new Set<string>();
      const homepageImageJobs: Array<{
        url: string;
        label: string;
        moduleName: string;
        sourceUrl: string;
      }> = [];
      const googleMaterialJobs: Array<{
        url: string;
        moduleName: string;
        sourceUrl: string;
      }> = [];

      for (const pageResult of crawledHomepagePages) {
        const { detail, links, unitName } = pageResult;
        selectedHomepagePageSlugs.add(detail.url);
        if (!moduleNames.includes(unitName)) moduleNames.push(unitName);
        selectedPageModuleNames.set(String(detail.page_id), unitName);
        for (const id of links.fileIds) {
          selectedModuleFileIds.add(String(id));
          selectedFileModuleNames.set(String(id), unitName);
        }
        for (const id of links.assignmentIds) {
          selectedModuleAssignmentIds.add(String(id));
          selectedAssignmentModuleNames.set(String(id), unitName);
        }

        const sourceUrl = `https://${canvas_domain}/courses/${canvasCourseId}/pages/${encodeURIComponent(detail.url)}`;
        for (const image of links.images) {
          homepageImageJobs.push({
            url: image.url,
            label: `${unitName} — ${detail.title}${image.alt ? ` — ${image.alt}` : ""}`,
            moduleName: unitName,
            sourceUrl,
          });
        }
        for (const url of links.externalUrls) {
          googleMaterialJobs.push({ url, moduleName: unitName, sourceUrl });
        }

        const plain = htmlToPlainText(detail.body) ?? "";
        if (
          plain.trim().length >= 30 &&
          !syncedPageSourceIds.has(String(detail.page_id))
        ) {
          contentItems.push({
            id: `canvas_home_page_${canvasCourseId}_${detail.page_id}`,
            courseId,
            canvasCourseId,
            sourceType: "canvas_page",
            type: "canvas_page",
            title: detail.title,
            bodyText: plain,
            textContent: plain,
            updatedAt: detail.updated_at ?? new Date().toISOString(),
            linkedFromModule: true,
            linkedFrom: frontPage?.url ?? null,
            sourceUrl,
            moduleName: unitName,
            metadata: {
              sourceFileId: `canvas_page_${canvasCourseId}_${detail.page_id}`,
              homepageUnit: true,
              depth: pageResult.depth,
            },
          });
        }
      }

      // Assignment descriptions frequently contain the only worked examples
      // or homework screenshots for a homepage-defined math unit.
      for (const assignment of liveAssignments) {
        const unitName = selectedAssignmentModuleNames.get(String(assignment.id));
        if (!unitName || !assignment.description) continue;
        const links = extractCanvasHtmlResourceLinks({
          html: assignment.description,
          courseId: canvasCourseId,
          domain: canvas_domain,
        });
        const sourceUrl = assignment.html_url;
        for (const id of links.fileIds) {
          selectedModuleFileIds.add(String(id));
          selectedFileModuleNames.set(String(id), unitName);
        }
        for (const image of links.images) {
          homepageImageJobs.push({
            url: image.url,
            label: `${unitName} — ${assignment.name}${image.alt ? ` — ${image.alt}` : ""}`,
            moduleName: unitName,
            sourceUrl,
          });
        }
        for (const url of links.externalUrls) {
          googleMaterialJobs.push({ url, moduleName: unitName, sourceUrl });
        }
      }

      const seenGoogleUrls = new Set<string>();
      const uniqueGoogleJobs = googleMaterialJobs
        .filter((job) => {
          const key = `${job.moduleName}\n${job.url}`;
          if (seenGoogleUrls.has(key)) return false;
          seenGoogleUrls.add(key);
          return true;
        })
        .slice(0, 8);
      const googleResults = await Promise.allSettled(
        uniqueGoogleJobs.map((job) =>
          extractFromGoogleLink({
            url: job.url,
            googleApiKey: process.env.GOOGLE_DRIVE_API_KEY,
          })
        )
      );
      for (let index = 0; index < googleResults.length; index++) {
        const result = googleResults[index];
        const job = uniqueGoogleJobs[index];
        if (
          result.status !== "fulfilled" ||
          !result.value ||
          result.value.trim().length < 50
        ) {
          continue;
        }
        contentItems.push({
          id: `canvas_home_google_${index}_${canvasCourseId}`,
          courseId,
          canvasCourseId,
          sourceType: "google_slide",
          type: "google_slide",
          title: `${job.moduleName} linked material`,
          bodyText: result.value,
          textContent: result.value,
          linkedFromModule: true,
          linkedFrom: job.sourceUrl,
          sourceUrl: job.url,
          moduleName: job.moduleName,
          metadata: { homepageUnit: true },
        });
      }

      for (const file of files) {
        const fileId = String(file.id);
        if (!selectedModuleFileIds.has(fileId)) continue;
        const contentType = (file["content-type"] ?? file.content_type ?? "")
          .split(";")[0]
          .trim()
          .toLowerCase();
        if (!IMAGE_MEDIA_TYPES[contentType] || !file.url) continue;
        const moduleName = selectedFileModuleNames.get(fileId);
        if (!moduleName) continue;
        homepageImageJobs.push({
          url: file.url,
          label: `${moduleName} — ${file.display_name || file.filename}`,
          moduleName,
          sourceUrl: file.url,
        });
      }

      const seenImageUrls = new Set<string>();
      const uniqueImageJobs = homepageImageJobs
        .filter((job) => {
          if (seenImageUrls.has(job.url)) return false;
          seenImageUrls.add(job.url);
          return true;
        })
        .slice(0, MAX_VISION_IMAGES);
      const downloadedImages = (
        await Promise.allSettled(
          uniqueImageJobs.map(async (job) => {
            const downloaded = await downloadCanvasFile(
              canvas_domain,
              access_token,
              job.url,
              MAX_VISION_IMAGE_BYTES
            );
            const mediaType = IMAGE_MEDIA_TYPES[downloaded.contentType];
            return mediaType
              ? { ...job, buffer: downloaded.buffer, mediaType }
              : null;
          })
        )
      ).flatMap((result) =>
        result.status === "fulfilled" && result.value ? [result.value] : []
      );
      if (downloadedImages.length > 0) {
        try {
          const ocrResults = await extractTextFromImages(
            downloadedImages.map((image) => ({
              buffer: image.buffer,
              mediaType: image.mediaType,
              label: image.label,
            })),
            `${course.name ?? "Canvas course"} selected unit notes and homework`
          );
          for (const result of ocrResults) {
            const image = downloadedImages[result.index];
            if (!image || result.extractedText.trim().length < 20) continue;
            contentItems.push({
              id: `canvas_home_image_${canvasCourseId}_${result.index}`,
              courseId,
              canvasCourseId,
              sourceType: "image",
              type: "image",
              title: image.label,
              bodyText: result.extractedText,
              textContent: result.extractedText,
              linkedFromModule: true,
              linkedFrom: image.sourceUrl,
              sourceUrl: image.url,
              moduleName: image.moduleName,
              metadata: { homepageUnit: true, visionExtracted: true },
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Vision extraction failed.";
          warnings.push(`Embedded images: ${message}`);
        }
      }

      // Reuse already-synced page/file text without losing the synthetic unit
      // label. Current sync IDs include the Canvas course ID before the final
      // resource ID, while older rows may contain only the resource ID.
      for (const item of contentItems) {
        const sourceFileId = String(item.metadata?.sourceFileId ?? "");
        const resourceId = sourceFileId.match(/_(\d+)$/)?.[1];
        const scopedName = sourceFileId.startsWith("canvas_page_")
          ? selectedPageModuleNames.get(resourceId ?? "")
          : sourceFileId.startsWith("canvas_file_")
            ? selectedFileModuleNames.get(resourceId ?? "")
            : undefined;
        if (scopedName) {
          item.moduleName = scopedName;
          item.linkedFromModule = true;
        }
      }

      // Some Canvas installations return 404/empty for the course-wide Pages
      // endpoint while still exposing Page items inside modules. Treat module
      // items as the authoritative page inventory so those pages remain usable.
      // Scoped groups come last so a selected child unit's label overrides its
      // broad parent module only for the items that child owns.
      const { pages: availablePages, pageToModule } =
        buildModuleAwarePageInventory(
          [
            ...pages,
            ...crawledHomepagePages.map(({ detail }) => detail),
          ],
          [...moduleItemsResults, ...selectedModuleResults]
        );
      for (const { detail, unitName } of crawledHomepagePages) {
        pageToModule.set(detail.url, unitName);
      }

      // Synced assignments are loaded before module membership is known. Tag
      // them now so an exact module selection does not discard their content.
      if (selectedModuleAssignmentIds.size > 0) {
        for (const item of contentItems) {
          const platformId = item.metadata?.platformId;
          if (item.type === "assignment" && selectedModuleAssignmentIds.has(String(platformId ?? ""))) {
            item.moduleName =
              selectedAssignmentModuleNames.get(String(platformId ?? "")) ??
              null;
            item.linkedFromModule = true;
          }
        }
      }

      // ── 2b: Score modules against topic ────────────────────────────────
      // Exact unit selection wins over fuzzy topic matching. This is crucial
      // when multiple units share the same broad Canvas parent module.
      const highMatchModules = hasExactUnitSelection
        ? new Set(selectedStructureNames)
        : new Set(
            modules
              .filter((module) => moduleTopicScore(module.name, topicWords) >= 0.3)
              .map((module) => module.name)
          );

      // ── 2c: Select pages to fetch bodies for ───────────────────────────
      // Priority 1: pages that belong to topic-matching modules
      // Priority 2: pages whose title keyword-matches the topic
      // All pages not already fully synced to DB are eligible

      const pagesByPriority: Array<{ page: (typeof availablePages)[number]; moduleName: string | null }> = [];
      const seenPageUrls = new Set<string>(selectedHomepagePageSlugs);

      // Priority 1: module-matched pages (ALL of them, regardless of title)
      for (const page of availablePages) {
        if (seenPageUrls.has(page.url)) continue;
        const modName = pageToModule.get(page.url) ?? null;
        if (modName && highMatchModules.has(modName)) {
          pagesByPriority.push({ page, moduleName: modName });
          seenPageUrls.add(page.url);
        }
      }

      if (!hasExactUnitSelection) {
        // Priority 2: remaining pages with title keyword match
        const remaining = availablePages.filter((page) => !seenPageUrls.has(page.url));
        const titleScored = remaining
          .map((p) => ({
            page: p,
            moduleName: pageToModule.get(p.url) ?? null,
            score: keywordScore(p.title, topicWords) + fuzzyTitleScore(p.title, topicWords) * 0.5,
          }))
          .filter((x) => x.score > 0.05)
          .sort((a, b) => b.score - a.score);
        pagesByPriority.push(...titleScored.map(({ page, moduleName }) => ({ page, moduleName })));

        // Priority 3: pages that belong to ANY module (structural relevance), not yet included
        for (const page of availablePages) {
          if (seenPageUrls.has(page.url)) continue;
          const modName = pageToModule.get(page.url);
          if (modName) {
            pagesByPriority.push({ page, moduleName: modName });
            seenPageUrls.add(page.url);
          }
        }
      }

      // Cap total page body fetches
      const pagesToFetch = pagesByPriority.slice(0, MAX_PAGE_BODY_FETCHES);

      const pageBodyResults = await Promise.all(
        pagesToFetch.map(async ({ page, moduleName }) => {
          // Skip pages already fully synced to DB (their content is in dbNotes)
          const alreadySynced = syncedPageSourceIds.has(String(page.page_id));
          // A selected unit page is still refreshed so linked files and
          // assignments can be discovered, but its duplicate text is not kept.
          if (alreadySynced && !hasExactUnitSelection) return null;
          try {
            const body = await fetchCanvasPageBody(
              canvas_domain,
              access_token,
              canvasCourseId,
              page.url
            );
            if (!body || body.trim().length < 30) return null;
            return {
              pageId: String(page.page_id),
              slug: page.url,
              title: page.title,
              body,
              moduleName,
              alreadySynced,
              updatedAt: page.updated_at ?? new Date().toISOString(),
            };
          } catch {
            return null;
          }
        })
      );

      for (const result of pageBodyResults) {
        if (!result) continue;
        if (result.moduleName && highMatchModules.has(result.moduleName)) {
          const linked = extractCanvasLinkedResourceIds(result.body);
          for (const id of linked.fileIds) {
            selectedModuleFileIds.add(String(id));
            selectedFileModuleNames.set(String(id), result.moduleName);
          }
          for (const id of linked.assignmentIds) {
            selectedModuleAssignmentIds.add(String(id));
            selectedAssignmentModuleNames.set(String(id), result.moduleName);
          }
        }
        if (result.alreadySynced) continue;
        contentItems.push({
          id: `canvas_page_${result.pageId}`,
          courseId,
          canvasCourseId,
          sourceType: "canvas_page",
          type: "canvas_page",
          title: result.title,
          bodyText: result.body,
          textContent: result.body,
          updatedAt: result.updatedAt,
          linkedFromModule: result.moduleName !== null,
          linkedFrom: null,
          sourceUrl: `https://${canvas_domain}/courses/${canvasCourseId}/pages/${result.slug}`,
          moduleName: result.moduleName,
          metadata: { sourceFileId: `canvas_page_${result.pageId}` },
        });
      }

      // Page bodies can link assignments that are not direct module items.
      // Apply those newly discovered memberships to synced assignment text.
      if (selectedModuleAssignmentIds.size > 0) {
        for (const item of contentItems) {
          const platformId = String(item.metadata?.platformId ?? "");
          const scopedName = selectedAssignmentModuleNames.get(platformId);
          if (item.type === "assignment" && scopedName) {
            item.moduleName = scopedName;
            item.linkedFromModule = true;
          }
        }
      }

      // ── 2d: Download topic-relevant Canvas files (PDFs, PPTX, DOCX) ───
      const topicFilePattern = new RegExp(
        topicWords.filter((w) => w.length > 3).join("|"),
        "i"
      );
      // Module file items often remain downloadable even when the course-wide
      // Files listing is forbidden. Merge their signed URLs into the inventory.
      const availableFiles = buildSelectedModuleFileInventory(files, selectedModuleResults);
      const availableFileIds = new Set(availableFiles.map((file) => String(file.id)));
      const missingSelectedFileIds = [...selectedModuleFileIds]
        .filter((id) => !availableFileIds.has(id))
        .map(Number)
        .filter((id) => Number.isSafeInteger(id) && id > 0)
        .slice(0, 24);
      if (missingSelectedFileIds.length > 0) {
        const linkedFiles = await Promise.all(
          missingSelectedFileIds.map((fileId) =>
            fetchCanvasFileById(
              canvas_domain,
              access_token,
              canvasCourseId,
              fileId
            )
          )
        );
        availableFiles.push(
          ...linkedFiles.filter((file): file is NonNullable<typeof file> => Boolean(file))
        );
      }
      const relevantFiles = availableFiles.filter((f) => {
        const name = `${f.display_name ?? ""} ${(f as unknown as { filename?: string }).filename ?? ""}`;
        const mimeType = (f as unknown as { "content-type"?: string; content_type?: string })["content-type"]
          ?? (f as unknown as { "content-type"?: string; content_type?: string }).content_type
          ?? "";
        const fileType = detectFileType(mimeType, name);
        if (!fileType) return false; // skip unsupported types
        // Match either topic words or high-value study terms
        return selectedModuleFileIds.has(String(f.id)) ||
          (!hasExactUnitSelection && (
            (topicWords.length > 0 && topicFilePattern.test(name)) ||
            HIGH_VALUE_FILE_TERMS.test(name)
          ));
      });

      // Sort by how closely the filename matches the topic
      const filesScored = relevantFiles
        .map((f) => ({
          f,
          score: keywordScore(f.display_name ?? "", topicWords) + fuzzyTitleScore(f.display_name ?? "", topicWords),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, selectedModuleFileIds.size > 0
          ? Math.min(24, Math.max(MAX_FILE_DOWNLOADS, selectedModuleFileIds.size))
          : MAX_FILE_DOWNLOADS);

      const fileResults = await Promise.allSettled(
        filesScored.map(async ({ f }) => {
          const mimeType = (f as unknown as { "content-type"?: string; content_type?: string })["content-type"]
            ?? (f as unknown as { "content-type"?: string; content_type?: string }).content_type
            ?? "";
          const fileName = (f as unknown as { filename?: string }).filename ?? f.display_name ?? "";
          const downloadUrl = (f as unknown as { url?: string }).url;
          const size = (f as unknown as { size?: number }).size ?? null;
          if (!downloadUrl) return null;
          const text = await downloadFileText(
            canvas_domain,
            downloadUrl,
            access_token,
            mimeType,
            fileName,
            size
          );
          if (!text || text.trim().length < 50) return null;
          return {
            id: `canvas_file_${f.id}`,
            title: f.display_name ?? fileName,
            text,
            mimeType,
            fileName,
          };
        })
      );

      for (const r of fileResults) {
        if (r.status !== "fulfilled" || !r.value) continue;
        const v = r.value;
        const resourceId = v.id.replace("canvas_file_", "");
        const scopedModuleName = selectedFileModuleNames.get(resourceId) ?? null;
        contentItems.push({
          id: v.id,
          courseId,
          canvasCourseId,
          sourceType: "pdf",
          type: "pdf",
          title: v.title,
          bodyText: v.text,
          textContent: v.text,
          linkedFromModule: scopedModuleName !== null,
          linkedFrom: null,
          moduleName: selectedModuleFileIds.has(resourceId)
            ? scopedModuleName
            : null,
          metadata: { fileName: v.fileName, mimeType: v.mimeType },
        });
      }

      // ── 2e: Live assignments not yet in DB ─────────────────────────────
      for (const a of liveAssignments) {
        if (!a.description || syncedAssignmentTitles.has(a.name)) continue;
        const plain = htmlToPlainText(a.description) ?? "";
        if (plain.trim().length < 20) continue;
        contentItems.push({
          id: `canvas_assignment_live_${a.id}`,
          courseId,
          canvasCourseId,
          sourceType: "assignment",
          type: "assignment",
          title: a.name,
          bodyText: plain,
          textContent: plain,
          dueAt: a.due_at,
          dueDate: a.due_at,
          updatedAt: a.due_at ?? new Date().toISOString(),
          linkedFromModule: selectedModuleAssignmentIds.has(String(a.id)),
          linkedFrom: null,
          moduleName: selectedModuleAssignmentIds.has(String(a.id))
            ? selectedAssignmentModuleNames.get(String(a.id)) ?? null
            : null,
          metadata: {},
        });
      }
    }
  }

  // ── Step 3: Chunk all collected content ───────────────────────────────────
  const docs = contentItems
    .map(toExtractedDoc)
    .filter((d): d is ExtractedDocument => Boolean(d));

  const chunks: DocumentChunk[] = docs
    .flatMap((d) => chunkDocument(d))
    .filter((c) => !isLogisticsChunk(c.text));

  if (chunks.length === 0) {
    return {
      ranked: [],
      confidence: scoreConfidence([]),
      hasDirectContent: false,
      moduleNames,
      warnings,
    };
  }

  // ── Step 4: Select candidate chunks for embedding ─────────────────────────
  // Prefer chunks from topic-matching modules, then keyword-matched chunks.
  // Remove strict minimum threshold — only hard-exclude zero-signal chunks
  // when the pool is large enough.
  const scoredChunks = chunks.map((c) => ({
    c,
    w:
      keywordScore(`${c.title}\n${c.text}`, topicWords) +
      fuzzyTitleScore(c.title, topicWords) * 0.6 +
      // Boost chunks from topic-matching modules
      (c.moduleName && highMatchModulesSet(c.moduleName, moduleNames, topicWords) ? 0.5 : 0),
  }));

  // Sort descending; take top MAX_CANDIDATE_CHUNKS
  scoredChunks.sort((a, b) => b.w - a.w);
  const positiveScoredChunks = scoredChunks.filter((item) => item.w > 0);
  const baseCandidates = positiveScoredChunks.length >= 5 ? positiveScoredChunks : scoredChunks;
  const selectedModuleKeys = new Set(
    [...resolvedSelectedModuleNames].map((name) => name.trim().toLowerCase())
  );
  const isSelectedModuleChunk = (chunk: DocumentChunk) => Boolean(
    selectedModuleKeys.size > 0 &&
      selectedModuleKeys.has(chunk.moduleName?.trim().toLowerCase() ?? "")
  );
  const selectedCandidates = selectedModuleKeys.size > 0
    ? scoredChunks.filter((item) => isSelectedModuleChunk(item.c))
    : [];
  const balancedSelectedCandidates = selectBalancedModuleSources(
    selectedCandidates.map((item) => ({ chunk: item.c, item })),
    [...resolvedSelectedModuleNames],
    MAX_CANDIDATE_CHUNKS
  ).map(({ item }) => item);
  const selectedCandidateIds = new Set(
    balancedSelectedCandidates.map((item) => item.c.id)
  );
  const candidates = [
    ...balancedSelectedCandidates,
    ...baseCandidates.filter((item) => !selectedCandidateIds.has(item.c.id)),
  ].slice(0, MAX_CANDIDATE_CHUNKS).map((item) => item.c);

  // ── Step 5: Embed + multi-signal rank ────────────────────────────────────
  const embeddings = await embedTexts([
    topic,
    ...candidates.map(
      (chunk) => `${chunk.title}\n${chunk.text.slice(0, 3000)}`
    ),
  ]);
  const queryEmbedding = embeddings[0];
  const ranked: RankedSource[] = [];

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
    const chunk = candidates[candidateIndex];
    const chunkEmbedding = embeddings[candidateIndex + 1];
    const semantic = Math.max(0, cosineSimilarity(queryEmbedding, chunkEmbedding));
    const keyword = keywordScore(chunk.text, topicWords);
    const titleKw = keywordScore(chunk.title, topicWords);
    const fuzzy = fuzzyTitleScore(chunk.title, topicWords);

    const modScore = chunk.moduleName
      ? moduleTopicScore(chunk.moduleName, topicWords)
      : 0.4;
    // Module match: 1.0 if strong module match, 0.3 if has module but no match, 0.5 if no module
    const moduleMatch = chunk.moduleName
      ? Math.max(0.3, modScore)
      : 0.5;

    const teacherPattern =
      /(study|review|guide|unit|chapter|exam|quiz|lesson|notes|slides|lecture)/i.test(
        chunk.title
      )
        ? 1
        : 0.4;
    const linkedFromModuleScore =
      chunk.metadata?.linkedFromModule === true || !!chunk.moduleName ? 1 : 0.3;
    const dateProximity = dateProximityScore(chunk.dueAt, testDate);
    const boostedModuleMatch = Math.min(1, moduleMatch * 0.8 + teacherPattern * 0.2);

    const scored = scoreChunk({
      chunk,
      semanticSimilarity: semantic,
      keywordMatch: keyword,
      titleMatch: titleKw,
      moduleMatch: boostedModuleMatch,
      teacherPatternScore: teacherPattern,
      fuzzyTitleMatch: fuzzy,
      linkedFromModuleScore,
      dateProximity,
    });
    scored.reasons.push(explainSourceChoice(scored));
    ranked.push(scored);
  }

  ranked.sort((a, b) => b.score - a.score);
  // An explicit Canvas module selection is a stronger relevance signal than
  // semantic similarity to a generic module title. Never replace it with
  // higher-scoring content from another unit.
  const rankedPool = selectedModuleKeys.size > 0
    ? ranked.filter((result) => isSelectedModuleChunk(result.chunk))
    : ranked;
  const top = selectBalancedModuleSources(
    rankedPool,
    [...resolvedSelectedModuleNames],
    limit
  );
  const confidence = scoreConfidence(top);
  const hasDirectContent = selectedModuleKeys.size > 0
    ? top.length > 0
    : top.some((r) => r.confidence >= 0.3);

  // ── Step 6: Style hint when no direct content ─────────────────────────────
  let styleHint: string | undefined;
  if (!hasDirectContent && chunks.length > 0) {
    const styleChunks = chunks
      .filter((c) => c.text.length > 100)
      .sort((a, b) => {
        const aScore =
          (/(study|review|guide|unit|chapter|lesson|notes|slides)/i.test(a.title) ? 2 : 0) +
          (a.text.length > 500 ? 1 : 0);
        const bScore =
          (/(study|review|guide|unit|chapter|lesson|notes|slides)/i.test(b.title) ? 2 : 0) +
          (b.text.length > 500 ? 1 : 0);
        return bScore - aScore;
      })
      .slice(0, 5);

    if (styleChunks.length > 0) {
      styleHint = styleChunks
        .map(
          (c) =>
            `### ${c.title}${c.moduleName ? ` (${c.moduleName})` : ""}\n${c.text.slice(0, 700)}`
        )
        .join("\n---\n");
    }
  }

  return {
    ranked: top,
    confidence,
    hasDirectContent,
    styleHint,
    moduleNames,
    warnings,
  };
}

// ── Internal helper ───────────────────────────────────────────────────────────

/** Returns true if this chunk's module matches the topic well. */
function highMatchModulesSet(
  moduleName: string,
  _allModuleNames: string[],
  topicWords: string[]
): boolean {
  return moduleTopicScore(moduleName, topicWords) >= 0.3;
}
