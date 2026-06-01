import type { EvalCase } from "./retrievalEvaluation";
import type { RankedSource } from "./types";

function mockRanked(id: string, confidence: number): RankedSource {
  return {
    chunk: {
      id: `${id}_chunk_0`,
      documentId: id,
      courseId: "course-1",
      title: id,
      chunkIndex: 0,
      text: "mock",
      category: "notes",
      sourceType: "page",
      tags: [],
      metadata: {},
    },
    score: confidence,
    confidence,
    reasons: [],
    signals: {
      semanticSimilarity: confidence,
      keywordMatch: confidence,
      titleMatch: confidence,
      moduleProximity: confidence,
      contentTypePriority: confidence,
      recencyScore: confidence,
      teacherPatternScore: confidence,
      fuzzyTitleMatch: confidence,
      linkedFromModuleScore: confidence,
      dateProximity: confidence,
    },
  };
}

export function sampleEvaluationCases(): EvalCase[] {
  return [
    {
      id: "teacher-a-modules-clear",
      label: "Teacher A uses modules clearly",
      relevantSourceIds: ["unit2-review-sheet", "unit2-lecture-notes"],
      retrieved: [
        mockRanked("unit2-review-sheet", 0.92),
        mockRanked("unit2-lecture-notes", 0.87),
        mockRanked("syllabus-overview", 0.25),
      ],
    },
    {
      id: "teacher-b-pdf-only",
      label: "Teacher B uploads PDFs only",
      relevantSourceIds: ["chapter4-pdf"],
      retrieved: [mockRanked("chapter4-pdf", 0.84), mockRanked("old-admin-pdf", 0.3)],
    },
    {
      id: "teacher-c-pages-notes",
      label: "Teacher C writes notes in pages",
      relevantSourceIds: ["photosynthesis-page"],
      retrieved: [mockRanked("photosynthesis-page", 0.89), mockRanked("calendar-page", 0.22)],
    },
    {
      id: "teacher-d-google-doc-links",
      label: "Teacher D links Google Docs",
      relevantSourceIds: ["unit3-google-doc"],
      retrieved: [mockRanked("unit3-google-doc", 0.8), mockRanked("welcome-announcement", 0.18)],
    },
    {
      id: "teacher-e-assignment-descriptions",
      label: "Teacher E uses assignment descriptions as lessons",
      relevantSourceIds: ["assignment-lesson-cell-cycle"],
      retrieved: [mockRanked("assignment-lesson-cell-cycle", 0.83), mockRanked("rubric-only", 0.19)],
    },
    {
      id: "teacher-f-messy-names",
      label: "Teacher F has messy file names",
      relevantSourceIds: ["doc-final-real-notes"],
      retrieved: [mockRanked("doc-final-real-notes", 0.77), mockRanked("random-old-copy", 0.26)],
    },
    {
      id: "teacher-g-old-duplicates",
      label: "Teacher G has old duplicates",
      relevantSourceIds: ["unit5-current-review"],
      retrieved: [mockRanked("unit5-current-review", 0.9), mockRanked("unit5-review-2022", 0.41)],
    },
  ];
}
