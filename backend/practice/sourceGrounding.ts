import type { CanvasItemType } from "@/backend/canvas-intelligence/types";

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "because", "been",
  "before", "being", "between", "both", "but", "can", "course", "does",
  "each", "from", "have", "into", "its", "more", "most", "not", "only",
  "other", "our", "should", "that", "the", "their", "then", "there",
  "these", "they", "this", "those", "through", "topic", "unit", "using",
  "was", "were", "what", "when", "where", "which", "while", "will", "with",
  "would", "you", "your",
]);

const NAVIGATION_WORDS = new Set([
  "account", "announcements", "assignments", "calendar", "dashboard", "files",
  "grades", "home", "homepage", "inbox", "modules", "navigation", "next",
  "previous", "settings", "syllabus",
]);

const INSTRUCTIONAL_LANGUAGE =
  /\b(?:analy[sz]e|apply|because|calculate|causes?|compare|concept|define|definition|derive|determine|evaluate|example|explain|factor|formula|function|identify|means?|model|process|relationship|represent|results?|solve|therefore|when|whereas)\b/i;
const MATH_OR_SCIENCE_SIGNAL =
  /(?:[a-z]\s*\([^)]{1,40}\)\s*=|\b\d+(?:\.\d+)?\s*[+\-*/^=<>]\s*[a-z0-9(]|[∑√±≤≥≈∞∆]|\b(?:sin|cos|tan|log|ln|slope|derivative|integral|equation|polynomial|variable|molecule|reaction)\b)/gi;

export interface InstructionalContentAssessment {
  usable: boolean;
  evidenceCharacters: number;
  meaningfulTerms: number;
  reason: "usable" | "empty" | "metadata_only" | "too_short" | "low_information";
}

export interface InstructionalTextOptions {
  title?: string | null;
  moduleName?: string | null;
  sourceType?: CanvasItemType | null;
  visionExtracted?: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSuperscripts(value: string): string {
  const superscripts: Record<string, string> = {
    "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
    "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  };
  return value.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (character) => `^${superscripts[character]}`);
}

/** Keep generated math readable in Markdown installations without a LaTeX renderer. */
export function normalizePracticeMath(value: string): string {
  return normalizeSuperscripts(value)
    .replace(/\\\(|\\\)|\\\[|\\\]/g, "")
    .replace(/\$\$([^$]+)\$\$/g, "$1")
    .replace(/(^|[^$])\$([^$\n]+)\$(?!\$)/g, "$1$2")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function removeKnownLabels(value: string, labels: Array<string | null | undefined>): string {
  let result = value;
  for (const label of labels) {
    const normalized = label?.replace(/\s+/g, " ").trim();
    if (!normalized || normalized.length < 3) continue;
    result = result.replace(new RegExp(escapeRegExp(normalized), "gi"), " ");
  }
  return result;
}

function evidenceText(
  value: string,
  options: InstructionalTextOptions
): string {
  const withoutLabels = removeKnownLabels(normalizePracticeMath(value), [
    options.title,
    options.moduleName,
  ]);
  return withoutLabels
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\[(?:image|link)(?::[^\]]*)?\]/gi, " ")
    .replace(/\b(?:click|tap)\s+(?:here|to\s+(?:begin|continue|open|view))\b/gi, " ")
    .replace(/\b(?:unit|module|chapter|week|lesson|section)\s*(?:#|no\.?\s*)?[\divxlcdm.]+[a-z]?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTokens(value: string): string[] {
  return (value.toLowerCase().match(/[a-z][a-z0-9'-]{2,}|\d+(?:\.\d+)?/g) ?? [])
    .filter((token) => !STOP_WORDS.has(token) && !NAVIGATION_WORDS.has(token));
}

/**
 * Distinguish actual lesson/worksheet content from a unit title, tile index, or
 * Canvas navigation page. Structural membership proves scope, not substance.
 */
export function assessInstructionalContent(
  value: string | null | undefined,
  options: InstructionalTextOptions = {}
): InstructionalContentAssessment {
  if (!value?.trim()) {
    return { usable: false, evidenceCharacters: 0, meaningfulTerms: 0, reason: "empty" };
  }

  const evidence = evidenceText(value, options);
  const tokens = meaningfulTokens(evidence);
  const meaningfulTerms = new Set(tokens).size;
  const evidenceCharacters = evidence.replace(/\s/g, "").length;
  const mathSignals = (evidence.match(MATH_OR_SCIENCE_SIGNAL) ?? []).length;
  const sentenceSignals = (evidence.match(/[.!?](?:\s|$)/g) ?? []).length;
  const instructionalLanguage = INSTRUCTIONAL_LANGUAGE.test(evidence);
  const sourceType = options.sourceType ?? null;
  const richDocument = ["pdf", "pptx", "docx", "google_slide", "google_doc", "image"]
    .includes(sourceType ?? "");
  const navigationProneSource = [
    "canvas_page", "page", "module_item", "assignment", "html",
  ].includes(sourceType ?? "");
  const hasInstructionalSignal =
    mathSignals > 0 || instructionalLanguage || sentenceSignals > 0;

  const usable =
    (options.visionExtracted === true && evidenceCharacters >= 55 &&
      (mathSignals >= 2 || (meaningfulTerms >= 6 && (hasInstructionalSignal || evidenceCharacters >= 180)))) ||
    (mathSignals >= 2 && evidenceCharacters >= 55 && meaningfulTerms >= 4) ||
    (richDocument && evidenceCharacters >= 75 && meaningfulTerms >= 7 &&
      (hasInstructionalSignal || evidenceCharacters >= 180)) ||
    (instructionalLanguage && sentenceSignals >= 1 && evidenceCharacters >= 90 && meaningfulTerms >= 8) ||
    (sentenceSignals >= 2 && evidenceCharacters >= 110 && meaningfulTerms >= 9) ||
    (!navigationProneSource && evidenceCharacters >= 220 && meaningfulTerms >= 14);

  if (usable) {
    return { usable: true, evidenceCharacters, meaningfulTerms, reason: "usable" };
  }
  if (evidenceCharacters < 30 || meaningfulTerms < 3) {
    return { usable: false, evidenceCharacters, meaningfulTerms, reason: "metadata_only" };
  }
  if (evidenceCharacters < 75) {
    return { usable: false, evidenceCharacters, meaningfulTerms, reason: "too_short" };
  }
  return { usable: false, evidenceCharacters, meaningfulTerms, reason: "low_information" };
}

export function hasEnoughInstructionalCoverage(
  assessments: readonly InstructionalContentAssessment[],
  questionCount: number
): boolean {
  const usable = assessments.filter((assessment) => assessment.usable);
  if (usable.length === 0) return false;
  const availableCharacters = usable.reduce(
    (total, assessment) => total + Math.min(2_000, assessment.evidenceCharacters),
    0
  );
  const requiredCharacters = Math.max(100, Math.min(600, questionCount * 40));
  return availableCharacters >= requiredCharacters;
}

function groundingTokens(value: string): string[] {
  return meaningfulTokens(
    normalizePracticeMath(value)
      .normalize("NFKC")
      .toLowerCase()
  );
}

/** Verify that the model supplied a real excerpt from the cited source. */
export function sourceExcerptIsGrounded(
  excerpt: string | null | undefined,
  sourceText: string | null | undefined
): boolean {
  if (!excerpt?.trim() || !sourceText?.trim()) return false;
  const excerptTokens = groundingTokens(excerpt);
  const sourceTokens = groundingTokens(sourceText);
  if (excerptTokens.length < 3 || new Set(excerptTokens).size < 2) return false;
  return sourceTokens.join(" ").includes(excerptTokens.join(" "));
}

/**
 * A citation is not enough by itself: require the question and correct answer
 * to share substantive terms with the cited Canvas excerpt/source.
 */
export function generatedQuestionIsGrounded(params: {
  question: string;
  correctAnswer: string;
  sourceText: string;
  sourceExcerpt: string;
}): boolean {
  if (!sourceExcerptIsGrounded(params.sourceExcerpt, params.sourceText)) return false;
  const sourceTerms = new Set(groundingTokens(params.sourceText));
  const answerTerms = groundingTokens(`${params.question} ${params.correctAnswer}`);
  const distinctAnswerTerms = [...new Set(answerTerms)];
  const overlappingTerms = distinctAnswerTerms.filter((term) => sourceTerms.has(term));
  const requiredOverlap = distinctAnswerTerms.length >= 8 ? 3 : 2;
  return overlappingTerms.length >= Math.min(requiredOverlap, distinctAnswerTerms.length);
}
