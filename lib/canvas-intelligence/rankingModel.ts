import type { ContentCategory, DocumentChunk, RankedSource } from "./types";

const CATEGORY_WEIGHT: Record<ContentCategory, number> = {
  study_guide: 1,
  quiz_test_review: 0.95,
  notes: 0.9,
  lecture_slides: 0.88,
  reading: 0.75,
  assignment: 0.7,
  homework: 0.65,
  syllabus: 0.4,
  announcement: 0.35,
  rubric: 0.3,
  external_resource: 0.5,
  irrelevant_admin: 0,
  practice_test: 0.92,
};

export function keywordScore(text: string, queryWords: string[]): number {
  if (queryWords.length === 0) return 0;
  const t = text.toLowerCase();
  const hits = queryWords.filter((w) => t.includes(w)).length;
  return Math.min(1, hits / Math.max(3, queryWords.length));
}

export function fuzzyTitleScore(title: string, queryWords: string[]): number {
  const t = title.toLowerCase();
  const hits = queryWords.filter((w) => t.includes(w)).length;
  return Math.min(1, hits / Math.max(1, queryWords.length));
}

export function recencyScore(updatedAt?: string | null): number {
  if (!updatedAt) return 0.3;
  const days = (Date.now() - new Date(updatedAt).getTime()) / (24 * 3600 * 1000);
  if (days <= 14) return 1;
  if (days <= 60) return 0.7;
  if (days <= 180) return 0.4;
  return 0.2;
}

export function dateProximityScore(dueAt?: string | null, testDate?: string | null): number {
  if (!dueAt || !testDate) return 0.5;
  const due = new Date(dueAt).getTime();
  const test = new Date(testDate).getTime();
  if (!Number.isFinite(due) || !Number.isFinite(test)) return 0.5;
  const days = Math.abs(due - test) / (24 * 3600 * 1000);
  if (days <= 3) return 1;
  if (days <= 7) return 0.8;
  if (days <= 14) return 0.6;
  if (days <= 30) return 0.4;
  return 0.2;
}

export function scoreChunk(params: {
  chunk: DocumentChunk;
  semanticSimilarity: number;
  keywordMatch: number;
  titleMatch: number;
  moduleMatch: number;
  teacherPatternScore: number;
  fuzzyTitleMatch: number;
  dateProximity: number;
  linkedFromModuleScore: number;
}): RankedSource {
  const ctp = CATEGORY_WEIGHT[params.chunk.category] ?? 0.5;
  const recency = recencyScore(params.chunk.updatedAt);

  const score =
    params.semanticSimilarity * 0.3 +
    params.keywordMatch * 0.2 +
    params.titleMatch * 0.15 +
    params.moduleMatch * 0.15 +
    ctp * 0.1 +
    params.dateProximity * 0.05 +
    params.linkedFromModuleScore * 0.05;

  const confidence = Math.max(0, Math.min(1, score * 0.85 + params.fuzzyTitleMatch * 0.15));

  return {
    chunk: params.chunk,
    score,
    confidence,
    reasons: [],
    signals: {
      semanticSimilarity: params.semanticSimilarity,
      keywordMatch: params.keywordMatch,
      titleMatch: params.titleMatch,
      moduleProximity: params.moduleMatch,
      contentTypePriority: ctp,
      recencyScore: recency,
      teacherPatternScore: params.teacherPatternScore,
      fuzzyTitleMatch: params.fuzzyTitleMatch,
      linkedFromModuleScore: params.linkedFromModuleScore,
      dateProximity: params.dateProximity,
    },
  };
}
