import type { CanvasContentItem, ContentCategory } from "./types";

const POSITIVE_PATTERNS: Array<[RegExp, ContentCategory]> = [
  [/study\s*guide|review\s*sheet|exam\s*review/i, "study_guide"],
  [/lecture|slides|deck|powerpoint|ppt/i, "lecture_slides"],
  [/quiz|test|exam\s*prep|practice\s*test/i, "quiz_test_review"],
  [/homework|hw\b|problem\s*set/i, "homework"],
  [/assignment|project|lab/i, "assignment"],
  [/rubric/i, "rubric"],
  [/reading|chapter|article/i, "reading"],
  [/syllabus/i, "syllabus"],
  [/announcement/i, "announcement"],
];

const ADMIN_PATTERNS = /attendance|policy|welcome|office hours|permissions|calendar overview/i;

export function classifyContent(item: CanvasContentItem, normalizedText: string): { category: ContentCategory; tags: string[] } {
  const basis = `${item.title} ${item.moduleName ?? ""} ${normalizedText.slice(0, 600)}`;
  const tags: string[] = [];

  if (ADMIN_PATTERNS.test(basis)) return { category: "irrelevant_admin", tags: ["admin"] };

  for (const [pattern, category] of POSITIVE_PATTERNS) {
    if (pattern.test(basis)) {
      tags.push(category);
      return { category, tags };
    }
  }

  if (item.type === "assignment") return { category: "assignment", tags: ["assignment"] };
  if (item.type === "page" || item.type === "module_item") return { category: "notes", tags: ["notes"] };
  if (item.type === "external_link") return { category: "external_resource", tags: ["external"] };

  return { category: "notes", tags: [] };
}
