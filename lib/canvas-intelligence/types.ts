export type CanvasItemType =
  | "module"
  | "module_item"
  | "page"
  | "assignment"
  | "file"
  | "syllabus"
  | "announcement"
  | "discussion"
  | "quiz"
  | "calendar_event"
  | "external_link";

export type ContentCategory =
  | "notes"
  | "lecture_slides"
  | "study_guide"
  | "assignment"
  | "homework"
  | "reading"
  | "practice_test"
  | "quiz_test_review"
  | "syllabus"
  | "announcement"
  | "rubric"
  | "external_resource"
  | "irrelevant_admin";

export interface CanvasContentItem {
  id: string;
  courseId: string;
  canvasCourseId: number;
  sourceType: CanvasItemType;
  type: CanvasItemType;
  title: string;
  bodyText?: string | null;
  htmlUrl?: string | null;
  html?: string | null;
  fileText?: string | null;
  sourceUrl?: string | null;
  url?: string | null;
  bodyHtml?: string | null;
  textContent?: string | null;
  folderPath?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  dueAt?: string | null;
  dueDate?: string | null;
  moduleName?: string | null;
  modulePosition?: number | null;
  itemPosition?: number | null;
  linkedFromModule: boolean;
  linkedFrom?: string | null;
  externalUrl?: string | null;
  fileMimeType?: string | null;
  fileSize?: number | null;
  contentId?: number | null;
  metadata: Record<string, unknown>;
}

export interface ExtractedDocument {
  id: string;
  itemId: string;
  courseId: string;
  title: string;
  sourceType: CanvasItemType;
  sourceUrl?: string | null;
  updatedAt?: string | null;
  moduleName?: string | null;
  dueAt?: string | null;
  content: string;
  normalizedContent: string;
  category: ContentCategory;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  courseId: string;
  title: string;
  chunkIndex: number;
  text: string;
  category: ContentCategory;
  sourceType: CanvasItemType;
  sourceUrl?: string | null;
  moduleName?: string | null;
  dueAt?: string | null;
  updatedAt?: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface RetrievalQuery {
  userId: string;
  query: string;
  courseId?: string | null;
  topic?: string | null;
  unit?: string | null;
  testDate?: string | null;
  assignmentId?: string | null;
  limit?: number;
}

export interface RankedSource {
  chunk: DocumentChunk;
  score: number;
  confidence: number;
  reasons: string[];
  signals: {
    semanticSimilarity: number;
    keywordMatch: number;
    titleMatch: number;
    moduleProximity: number;
    contentTypePriority: number;
    recencyScore: number;
    teacherPatternScore: number;
    fuzzyTitleMatch: number;
    linkedFromModuleScore: number;
    dateProximity: number;
  };
}

export interface ConfidenceResult {
  overall: number;
  level: "high" | "medium" | "low";
  shouldAskForClarification: boolean;
  explanation: string;
}
