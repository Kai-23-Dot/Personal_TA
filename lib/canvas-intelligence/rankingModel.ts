import type { ContentCategory, DocumentChunk, RankedSource } from "./types";

const CATEGORY_WEIGHT: Record<ContentCategory, number> = {
  study_guide: 1,
  quiz_test_review: 0.95,
  practice_test: 0.92,
  notes: 0.9,
  lecture_slides: 0.88,
  reading: 0.75,
  assignment: 0.7,
  homework: 0.65,
  external_resource: 0.5,
  syllabus: 0.4,
  announcement: 0.35,
  rubric: 0.3,
  irrelevant_admin: 0,
};

/**
 * Keyword hit-rate score with phrase-match bonus.
 * If 2+ consecutive query words appear together in the text, score gets a +0.25 boost.
 */
export function keywordScore(text: string, queryWords: string[]): number {
  if (queryWords.length === 0) return 0;
  const t = text.toLowerCase();
  const wordHits = queryWords.filter((w) => t.includes(w)).length;
  const baseScore = Math.min(1, wordHits / Math.max(3, queryWords.length));

  // Phrase bonus
  if (queryWords.length >= 2) {
    for (let i = 0; i < queryWords.length - 1; i++) {
      const phrase = queryWords.slice(i, i + 2).join(" ");
      if (t.includes(phrase)) {
        return Math.min(1, baseScore + 0.25);
      }
    }
  }
  return baseScore;
}

/**
 * Title-specific fuzzy match — higher weight per word.
 * Also awards 0.5 credit for prefix matches (>= 4-char prefix overlap).
 */
export function fuzzyTitleScore(title: string, queryWords: string[]): number {
  const t = title.toLowerCase();
  let hits = 0;
  for (const w of queryWords) {
    if (t.includes(w)) {
      hits++;
    } else {
      const prefix = w.slice(0, 5);
      if (
        prefix.length >= 4 &&
        t.split(/\W+/).some((tw) => tw.startsWith(prefix))
      ) {
        hits += 0.5;
      }
    }
  }
  return Math.min(1, hits / Math.max(1, queryWords.length));
}

export function recencyScore(updatedAt?: string | null): number {
  if (!updatedAt) return 0.3;
  const days =
    (Date.now() - new Date(updatedAt).getTime()) / (24 * 3600 * 1000);
  if (days <= 14) return 1;
  if (days <= 60) return 0.7;
  if (days <= 180) return 0.4;
  return 0.2;
}

export function dateProximityScore(
  dueAt?: string | null,
  testDate?: string | null
): number {
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

  // When semantic similarity is 0 (zero-vector / no embedding key), redistribute
  // its weight to keyword + structural signals so scores still reflect relevance.
  const hasEmbedding = params.semanticSimilarity > 0;

  const score = hasEmbedding
    ? params.semanticSimilarity * 0.35 +
      params.keywordMatch * 0.18 +
      params.titleMatch * 0.12 +
      params.moduleMatch * 0.15 +
      ctp * 0.10 +
      params.dateProximity * 0.05 +
      params.linkedFromModuleScore * 0.05
    : params.keywordMatch * 0.32 +
      params.titleMatch * 0.22 +
      params.moduleMatch * 0.22 +
      ctp * 0.14 +
      params.dateProximity * 0.05 +
      params.linkedFromModuleScore * 0.05;

  const confidence = Math.max(
    0,
    Math.min(1, score * 0.82 + params.fuzzyTitleMatch * 0.18)
  );

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
