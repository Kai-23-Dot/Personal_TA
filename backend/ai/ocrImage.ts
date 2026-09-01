/**
 * OCR for handwritten notes and images using GPT-4o vision.
 * Accepts JPEG, PNG, GIF, WebP. Max file size ~5 MB per image.
 */
import { generateText } from "ai";
import { visionModel } from "./provider";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export interface OCRResult {
  extractedText: string;
  structuredContent: string; // Markdown-formatted, organized version
  confidence: "high" | "medium" | "low";
  warnings: string[];
}

export interface BatchOCRImage {
  buffer: Buffer;
  mediaType: ImageMediaType;
  label: string;
}

export interface BatchOCRResult {
  index: number;
  extractedText: string;
}

export function parseBatchOCRResponse(
  response: string,
  imageCount: number
): BatchOCRResult[] {
  try {
    const cleaned = response
      .trim()
      .replace(/^```(?:json)?\n?/i, "")
      .replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned) as {
      images?: Array<{ index?: unknown; extracted_text?: unknown; text?: unknown }>;
    };
    const seen = new Set<number>();
    return (parsed.images ?? []).flatMap((item) => {
      const index = Number(item.index);
      const extractedText = String(item.extracted_text ?? item.text ?? "").trim();
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= imageCount ||
        !extractedText ||
        seen.has(index)
      ) {
        return [];
      }
      seen.add(index);
      return [{ index, extractedText }];
    });
  } catch {
    return imageCount === 1 && response.trim()
      ? [{ index: 0, extractedText: response.trim() }]
      : [];
  }
}

/**
 * Extract text from an image buffer using GPT-4o vision.
 * @param imageBuffer  Raw image bytes
 * @param mediaType    MIME type of the image
 * @param context      Optional context hint (e.g. "chemistry notes", "math homework")
 */
export async function extractTextFromImage(
  imageBuffer: Buffer,
  mediaType: ImageMediaType,
  context?: string
): Promise<OCRResult> {
  const base64 = imageBuffer.toString("base64");

  const systemPrompt = `You are an expert OCR assistant that transcribes handwritten and printed notes.

Your job:
1. Extract ALL text from the image faithfully — including any formulas, diagrams labeled with text, and marginalia.
2. Preserve the logical structure (headings, bullet points, numbered lists, tables).
3. Format math/science notation clearly (e.g. use x^2, sqrt(x), H2O).
4. Return a JSON object with this exact shape (no markdown fences):

{
  "extracted_text": "Raw transcription, preserving original structure as closely as possible",
  "structured_content": "Markdown-formatted, organized version with headers and lists",
  "confidence": "high|medium|low",
  "warnings": ["Any issues: illegible sections, cut-off text, etc."]
}`;

  const userText = context
    ? `Context: This image contains ${context}. Please extract all text.`
    : "Please extract all text from this image.";

  const { text } = await generateText({
    model: visionModel,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            image: `data:${mediaType};base64,${base64}`,
          },
          {
            type: "text",
            text: userText,
          },
        ],
      },
    ],
    maxTokens: 4000,
  });

  try {
    const cleaned = text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned);
    return {
      extractedText: parsed.extracted_text ?? "",
      structuredContent: parsed.structured_content ?? "",
      confidence: parsed.confidence ?? "medium",
      warnings: parsed.warnings ?? [],
    };
  } catch {
    // Fallback: treat raw response as extracted text
    return {
      extractedText: text,
      structuredContent: text,
      confidence: "low",
      warnings: ["Could not parse structured response — raw text returned"],
    };
  }
}

/**
 * OCR several Canvas images in one vision request. Keeping the image index in
 * the structured response preserves each image's unit/page membership while
 * avoiding one model round-trip per screenshot.
 */
export async function extractTextFromImages(
  images: readonly BatchOCRImage[],
  context?: string
): Promise<BatchOCRResult[]> {
  if (images.length === 0) return [];
  const boundedImages = images.slice(0, 12);
  const content = [
    {
      type: "text" as const,
      text: `Extract the educational content from every supplied image. Preserve formulas, worked examples, diagrams, tables, questions, and answer choices. Ignore decorative backgrounds and navigation. Return only JSON with this shape: {"images":[{"index":0,"extracted_text":"faithful Markdown transcription"}]}. Include one entry per image and use its zero-based IMAGE index.${context ? ` Context: ${context}.` : ""}`,
    },
    ...boundedImages.flatMap((image, index) => [
      {
        type: "text" as const,
        text: `IMAGE ${index} — ${image.label.slice(0, 200)}`,
      },
      {
        type: "image" as const,
        image: `data:${image.mediaType};base64,${image.buffer.toString("base64")}`,
      },
    ]),
  ];

  const { text } = await generateText({
    model: visionModel,
    system:
      "You are a precise OCR system for school materials. Never solve or summarize the work; transcribe it so another model can create grounded practice questions.",
    messages: [{ role: "user", content }],
    maxTokens: 6000,
  });

  return parseBatchOCRResponse(text, boundedImages.length);
}

/** Identify unit/module labels embedded in graphical Canvas homepage tiles. */
export async function extractUnitLabelsFromImages(
  images: readonly BatchOCRImage[]
): Promise<BatchOCRResult[]> {
  if (images.length === 0) return [];
  const boundedImages = images.slice(0, 12);
  const content = [
    {
      type: "text" as const,
      text: "Read only the primary navigation label on each course tile. Valid examples include Unit 1A, Module 3, Chapter 4, Week 2, or AP Exam Review Materials. Ignore decorative formulas and background writing. Return only JSON shaped as {\"images\":[{\"index\":0,\"extracted_text\":\"Unit 1A\"}]}. Use an empty string when no structural course-section label is visible.",
    },
    ...boundedImages.flatMap((image, index) => [
      { type: "text" as const, text: `IMAGE ${index} — ${image.label.slice(0, 120)}` },
      {
        type: "image" as const,
        image: `data:${image.mediaType};base64,${image.buffer.toString("base64")}`,
      },
    ]),
  ];

  const { text } = await generateText({
    model: visionModel,
    system:
      "You identify concise unit and module labels in LMS navigation graphics. Do not transcribe the decorative background.",
    messages: [{ role: "user", content }],
    maxTokens: 1000,
  });

  return parseBatchOCRResponse(text, boundedImages.length);
}
