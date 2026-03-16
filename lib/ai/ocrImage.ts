/**
 * OCR for handwritten notes and images using Sarvam Vision (sarvam-m multimodal).
 *
 * Sarvam-m reads images via the OpenAI-compatible chat completions API.
 * Accepts JPEG, PNG, GIF, WebP. Max file size ~5 MB per image.
 */
import { generateText } from "ai";
import { chatModel } from "./provider";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export interface OCRResult {
  extractedText: string;
  structuredContent: string; // Markdown-formatted, organized version
  confidence: "high" | "medium" | "low";
  warnings: string[];
}

/**
 * Extract text from an image buffer using Claude's vision capability.
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
    model: chatModel,
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
