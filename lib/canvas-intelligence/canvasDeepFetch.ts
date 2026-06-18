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

import { createServiceClient } from "@/lib/supabase/server";
import {
  fetchCanvasModules,
  fetchCanvasModuleItems,
  fetchCanvasPages,
  fetchCanvasAssignments,
  fetchCanvasPageBody,
  fetchCanvasFilesWide,
  htmlToPlainText,
} from "@/lib/lms/canvas";
import { detectFileType, extractFileText } from "@/lib/utils/extractFileText";
import { classifyContent } from "./contentClassifier";
import { chunkDocument } from "./chunker";
import { scoreConfidence } from "./confidenceScorer";
import { embedText, cosineSimilarity } from "./embeddingIndexer";
import {
  dateProximityScore,
  scoreChunk,
  keywordScore,
  fuzzyTitleScore,
} from "./rankingModel";
import { explainSourceChoice } from "./sourceExplainer";
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

const HIGH_VALUE_FILE_TERMS =
  /\b(notes?|slides?|lecture|lesson|unit|chapter|study\s*guide|review|packet|worksheet|reading|handout|presentation|powerpoint|ppt|pdf)\b/i;

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
    metadata: {},
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
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const text = await extractFileText(buf, fileType);
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
}

// ── Core algorithm ────────────────────────────────────────────────────────────

export async function canvasDeepFetch(params: {
  userId: string;
  courseId: string;
  topic: string;
  limit?: number;
  testDate?: string;
}): Promise<CanvasDeepFetchResult> {
  const { userId, courseId, topic, limit = 12, testDate } = params;
  const supabase = createServiceClient();

  // Precompute topic words once (used throughout)
  const topicWords = topic
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);

  // ── Step 1: Load DB-synced content ────────────────────────────────────────
  const [
    { data: connection },
    { data: course },
    { data: dbNotes },
    { data: dbAssignments },
  ] = await Promise.all([
    supabase
      .from("lms_connections")
      .select("access_token, canvas_domain")
      .eq("user_id", userId)
      .eq("platform", "canvas")
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("courses")
      .select("platform_id, name")
      .eq("id", courseId)
      .eq("user_id", userId)
      .maybeSingle(),
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
      .select("id, course_id, title, description, due_date, updated_at")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .not("description", "is", null)
      .order("updated_at", { ascending: false })
      .limit(60),
  ]);

  const contentItems: CanvasContentItem[] = [
    ...((dbNotes ?? []) as NoteRow[]).map(noteToContentItem),
    ...((dbAssignments ?? []) as AssignmentRow[]).map(assignmentRowToContentItem),
  ];

  const moduleNames: string[] = [];

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
          .map((id) => id.replace("canvas_page_", ""))
      );
      const syncedAssignmentTitles = new Set(
        (dbAssignments ?? []).map((a) => a.title)
      );

      // Parallel Canvas API calls
      const [modules, pages, liveAssignments, files] = await Promise.all([
        fetchCanvasModules(canvas_domain, access_token, canvasCourseId),
        fetchCanvasPages(canvas_domain, access_token, canvasCourseId),
        fetchCanvasAssignments(canvas_domain, access_token, canvasCourseId),
        fetchCanvasFilesWide(canvas_domain, access_token, canvasCourseId, 200).catch(() => [] as Awaited<ReturnType<typeof fetchCanvasFilesWide>>),
      ]);

      moduleNames.push(...modules.map((m) => m.name));

      // ── 2a: Fetch module items → build page→module map ──────────────────
      const moduleSlice = modules.slice(0, MAX_MODULES_FOR_ITEM_FETCH);
      const moduleItemsResults = await Promise.all(
        moduleSlice.map((m) =>
          fetchCanvasModuleItems(canvas_domain, access_token, canvasCourseId, m.id)
            .then((items) => ({ module: m, items }))
            .catch(() => ({ module: m, items: [] as Awaited<ReturnType<typeof fetchCanvasModuleItems>> }))
        )
      );

      const pageToModule = new Map<string, string>();
      for (const { module, items } of moduleItemsResults) {
        for (const item of items) {
          if (item.type === "Page" && item.page_url) {
            pageToModule.set(item.page_url, module.name);
          }
        }
      }

      // ── 2b: Score modules against topic ────────────────────────────────
      const moduleScores = new Map<string, number>();
      for (const m of modules) {
        moduleScores.set(m.name, moduleTopicScore(m.name, topicWords));
      }
      const highMatchModules = new Set(
        [...moduleScores.entries()]
          .filter(([, s]) => s >= 0.3)
          .map(([name]) => name)
      );

      // ── 2c: Select pages to fetch bodies for ───────────────────────────
      // Priority 1: pages that belong to topic-matching modules
      // Priority 2: pages whose title keyword-matches the topic
      // All pages not already fully synced to DB are eligible

      const pagesByPriority: Array<{ page: (typeof pages)[number]; moduleName: string | null }> = [];
      const seenPageIds = new Set<number>();

      // Priority 1: module-matched pages (ALL of them, regardless of title)
      for (const page of pages) {
        const modName = pageToModule.get(page.url) ?? null;
        if (modName && highMatchModules.has(modName)) {
          pagesByPriority.unshift({ page, moduleName: modName }); // front
          seenPageIds.add(page.page_id);
        }
      }

      // Priority 2: remaining pages with title keyword match
      const remaining = pages.filter((p) => !seenPageIds.has(p.page_id));
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
      for (const page of pages) {
        if (seenPageIds.has(page.page_id)) continue;
        const modName = pageToModule.get(page.url);
        if (modName) {
          pagesByPriority.push({ page, moduleName: modName });
          seenPageIds.add(page.page_id);
        }
      }

      // Cap total page body fetches
      const pagesToFetch = pagesByPriority.slice(0, MAX_PAGE_BODY_FETCHES);

      const pageBodyResults = await Promise.all(
        pagesToFetch.map(async ({ page, moduleName }) => {
          // Skip pages already fully synced to DB (their content is in dbNotes)
          if (syncedPageSourceIds.has(String(page.page_id))) return null;
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
              updatedAt: page.updated_at ?? new Date().toISOString(),
            };
          } catch {
            return null;
          }
        })
      );

      for (const result of pageBodyResults) {
        if (!result) continue;
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
          moduleName: result.moduleName,
          metadata: { sourceFileId: `canvas_page_${result.pageId}` },
        });
      }

      // ── 2d: Download topic-relevant Canvas files (PDFs, PPTX, DOCX) ───
      const topicFilePattern = new RegExp(
        topicWords.filter((w) => w.length > 3).join("|"),
        "i"
      );
      const relevantFiles = files.filter((f) => {
        const name = `${f.display_name ?? ""} ${(f as unknown as { filename?: string }).filename ?? ""}`;
        const mimeType = (f as unknown as { "content-type"?: string; content_type?: string })["content-type"]
          ?? (f as unknown as { "content-type"?: string; content_type?: string }).content_type
          ?? "";
        const fileType = detectFileType(mimeType, name);
        if (!fileType) return false; // skip unsupported types
        // Match either topic words or high-value study terms
        return (topicWords.length > 0 && topicFilePattern.test(name)) ||
          HIGH_VALUE_FILE_TERMS.test(name);
      });

      // Sort by how closely the filename matches the topic
      const filesScored = relevantFiles
        .map((f) => ({
          f,
          score: keywordScore(f.display_name ?? "", topicWords) + fuzzyTitleScore(f.display_name ?? "", topicWords),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_FILE_DOWNLOADS);

      const fileResults = await Promise.allSettled(
        filesScored.map(async ({ f }) => {
          const mimeType = (f as unknown as { "content-type"?: string; content_type?: string })["content-type"]
            ?? (f as unknown as { "content-type"?: string; content_type?: string }).content_type
            ?? "";
          const fileName = (f as unknown as { filename?: string }).filename ?? f.display_name ?? "";
          const downloadUrl = (f as unknown as { url?: string }).url;
          const size = (f as unknown as { size?: number }).size ?? null;
          if (!downloadUrl) return null;
          const text = await downloadFileText(downloadUrl, access_token, mimeType, fileName, size);
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
        contentItems.push({
          id: v.id,
          courseId,
          canvasCourseId,
          sourceType: "pdf",
          type: "pdf",
          title: v.title,
          bodyText: v.text,
          textContent: v.text,
          linkedFromModule: false,
          linkedFrom: null,
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
          linkedFromModule: false,
          linkedFrom: null,
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
  const candidates =
    scoredChunks.filter((x) => x.w > 0).length >= 5
      ? scoredChunks.filter((x) => x.w > 0).slice(0, MAX_CANDIDATE_CHUNKS).map((x) => x.c)
      : scoredChunks.slice(0, MAX_CANDIDATE_CHUNKS).map((x) => x.c);

  // ── Step 5: Embed + multi-signal rank ────────────────────────────────────
  const queryEmbedding = await embedText(topic);
  const ranked: RankedSource[] = [];

  for (const chunk of candidates) {
    const chunkEmbedding = await embedText(
      `${chunk.title}\n${chunk.text.slice(0, 3000)}`
    );
    const semantic = Math.max(0, cosineSimilarity(queryEmbedding, chunkEmbedding));
    const keyword = keywordScore(chunk.text, topicWords);
    const titleKw = keywordScore(chunk.title, topicWords);
    const fuzzy = fuzzyTitleScore(chunk.title, topicWords);

    const topicLower = topic.toLowerCase();
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
  const top = ranked.slice(0, limit);
  const confidence = scoreConfidence(top);
  const hasDirectContent = top.some((r) => r.confidence >= 0.3);

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

  return { ranked: top, confidence, hasDirectContent, styleHint, moduleNames };
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
