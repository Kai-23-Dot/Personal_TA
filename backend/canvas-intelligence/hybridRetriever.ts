import { createServiceClient } from "@/backend/supabase/server";
import { classifyContent } from "./contentClassifier";
import { chunkDocument } from "./chunker";
import { scoreConfidence } from "./confidenceScorer";
import { embedText, cosineSimilarity } from "./embeddingIndexer";
import { dateProximityScore, scoreChunk, keywordScore, fuzzyTitleScore } from "./rankingModel";
import { explainSourceChoice } from "./sourceExplainer";
import type { CanvasContentItem, DocumentChunk, ExtractedDocument, RankedSource, RetrievalQuery } from "./types";

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

function toCanvasItemFromNote(note: NoteRow): CanvasContentItem {
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
    linkedFromModule: (note.source_file_id ?? "").startsWith("canvas_page_") || (note.source_file_id ?? "").startsWith("canvas_file_"),
    linkedFrom: null,
    metadata: {
      sourceFileId: note.source_file_id,
      fileType: note.file_type,
      unit: note.unit_name,
      exam: note.exam_name,
    },
  };
}

function toCanvasItemFromAssignment(a: AssignmentRow): CanvasContentItem {
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

function toExtractedDocument(item: CanvasContentItem): ExtractedDocument | null {
  const content = (item.textContent ?? "").trim();
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

export async function retrieveRankedSources(query: RetrievalQuery): Promise<{
  ranked: RankedSource[];
  confidence: ReturnType<typeof scoreConfidence>;
}> {
  const supabase = createServiceClient();
  const limit = query.limit ?? 8;

  const noteQ = supabase
    .from("notes")
    .select("id, course_id, title, content, source_url, source_file_id, updated_at, file_type, unit_name, exam_name")
    .eq("user_id", query.userId)
    .not("content", "is", null)
    .order("updated_at", { ascending: false })
    .limit(120);

  const assignmentQ = supabase
    .from("assignments")
    .select("id, course_id, title, description, due_date, updated_at")
    .eq("user_id", query.userId)
    .not("description", "is", null)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (query.courseId) {
    noteQ.eq("course_id", query.courseId);
    assignmentQ.eq("course_id", query.courseId);
  }

  const [{ data: notes }, { data: assignments }] = await Promise.all([noteQ, assignmentQ]);
  const items: CanvasContentItem[] = [
    ...((notes ?? []) as NoteRow[]).map(toCanvasItemFromNote),
    ...((assignments ?? []) as AssignmentRow[]).map(toCanvasItemFromAssignment),
  ];

  const docs = items.map(toExtractedDocument).filter((d): d is ExtractedDocument => Boolean(d));
  const chunks: DocumentChunk[] = docs.flatMap((d) => chunkDocument(d));

  const queryWords = query.query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const narrowed = chunks
    .map((c) => ({ c, w: keywordScore(`${c.title}\n${c.text}`, queryWords) + fuzzyTitleScore(c.title, queryWords) }))
    .filter((x) => x.w > 0.1)
    .sort((a, b) => b.w - a.w)
    .slice(0, 24)
    .map((x) => x.c);

  const queryEmbedding = await embedText(query.query);
  const ranked: RankedSource[] = [];

  for (const chunk of narrowed) {
    const chunkEmbedding = await embedText(`${chunk.title}\n${chunk.text.slice(0, 3000)}`);
    const semantic = Math.max(0, cosineSimilarity(queryEmbedding, chunkEmbedding));
    const keyword = keywordScore(chunk.text, queryWords);
    const title = keywordScore(chunk.title, queryWords);
    const fuzzy = fuzzyTitleScore(chunk.title, queryWords);
    const moduleMatch = chunk.moduleName && query.unit ? (chunk.moduleName.toLowerCase().includes(query.unit.toLowerCase()) ? 1 : 0.3) : 0.5;
    const teacherPattern = /(study|review|guide|unit|chapter|exam|quiz|lesson|notes|slides)/i.test(chunk.title) ? 1 : 0.4;
    const linkedFromModuleScore = (chunk.metadata?.linkedFromModule === true || chunk.moduleName) ? 1 : 0.3;
    const dateProximity = dateProximityScore(chunk.dueAt, query.testDate);
    const boostedModuleMatch = Math.min(1, moduleMatch * 0.8 + teacherPattern * 0.2);
    const scored = scoreChunk({
      chunk,
      semanticSimilarity: semantic,
      keywordMatch: keyword,
      titleMatch: title,
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

  return { ranked: top, confidence };
}
