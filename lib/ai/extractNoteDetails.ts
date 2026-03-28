import { generateText } from "ai";
import { fastModel } from "./provider";

export type NoteExtraction = {
  key_concepts: string[];
  formulas: string[];
  definitions: Array<{ term: string; definition: string }>;
  examples: string[];
};

const SYSTEM_PROMPT = `You are an expert study assistant. Extract key learning elements from the notes.
Return ONLY valid JSON with this exact shape:
{
  "key_concepts": ["Concept 1", "Concept 2"],
  "formulas": ["formula or equation", "..."],
  "definitions": [{"term":"", "definition":""}],
  "examples": ["Example 1", "Example 2"]
}
Rules:
- Keep items concise and student-friendly.
- If no formulas or examples exist, return empty arrays.
- Do not add extra keys.`;

export async function extractNoteDetails(content: string): Promise<NoteExtraction> {
  const { text } = await generateText({
    model: fastModel,
    system: SYSTEM_PROMPT,
    prompt: content.slice(0, 12000),
    maxTokens: 800,
  });

  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const json = JSON.parse(text.slice(start, end + 1));
    return {
      key_concepts: Array.isArray(json.key_concepts) ? json.key_concepts : [],
      formulas: Array.isArray(json.formulas) ? json.formulas : [],
      definitions: Array.isArray(json.definitions) ? json.definitions : [],
      examples: Array.isArray(json.examples) ? json.examples : [],
    };
  } catch {
    return { key_concepts: [], formulas: [], definitions: [], examples: [] };
  }
}
