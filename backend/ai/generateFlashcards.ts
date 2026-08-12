import { generateText } from "ai";
import { chatModel } from "./provider";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import type { SRSGrade } from "@/types";

export interface GeneratedFlashcard {
  id: string;
  front: string;
  back: string;
  hint: string | null;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
}

const rawCardSchema = z.object({
  front: z.string().trim().min(3).max(500),
  back: z.string().trim().min(1).max(2000),
  hint: z.string().trim().min(1).max(500).nullable().optional(),
  topic: z.string().trim().min(1).max(120),
  difficulty: z.enum(["easy", "medium", "hard"]),
}).strict();

const cardEnvelopeSchema = z.object({
  cards: z.array(rawCardSchema).max(30),
}).strict();

type RawCard = z.infer<typeof rawCardSchema>;

export function validateGeneratedFlashcards(
  value: unknown,
  expectedCount: number
): RawCard[] {
  const parsed = cardEnvelopeSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Flashcard generation returned an invalid response.");
  }
  if (parsed.data.cards.length !== expectedCount) {
    throw new Error(`Flashcard generation did not return exactly ${expectedCount} cards.`);
  }

  const fronts = new Set<string>();
  for (const card of parsed.data.cards) {
    const normalized = card.front.toLocaleLowerCase().replace(/\W+/g, " ").trim();
    if (!normalized || fronts.has(normalized)) {
      throw new Error("Flashcard generation returned duplicate cards.");
    }
    fronts.add(normalized);
  }
  return parsed.data.cards;
}

function parseFlashcardJson(text: string): unknown {
  const stripped = text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("Flashcard generation returned no JSON object.");
  }
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    throw new Error("Flashcard generation returned malformed JSON.");
  }
}

export async function generateFlashcardsFromContent(
  content: string,
  topic: string,
  count: number = 10,
  courseName?: string,
  difficulty: "easy" | "medium" | "hard" | "mixed" = "mixed"
): Promise<GeneratedFlashcard[]> {
  const difficultyInstruction =
    difficulty === "mixed"
      ? `Mix difficulties evenly across easy, medium, and hard.`
      : `All cards must have difficulty: "${difficulty}". ${
          difficulty === "easy"
            ? "Focus on basic definitions, recall, and simple facts."
            : difficulty === "medium"
            ? "Focus on concept explanations, comparisons, and application."
            : "Focus on synthesis, analysis, edge cases, and complex reasoning."
        }`;
  const prompt = [
    `Create exactly ${count} flashcards for a high school student.`,
    courseName ? `Course: ${courseName}` : null,
    `Topic: ${topic}`,
    `Difficulty requirement: ${difficultyInstruction}`,
    `Rules: concise fronts (question or term), complete backs (answer/definition), hint when tricky.`,
    `Mix content types: definitions, concept explanations, formulas, comparisons.`,
    "",
    `Study material:\n${content.slice(0, 20000)}`,
    `\nReturn ONLY a valid JSON object — no markdown fences, no extra commentary. Format:
{
  "cards": [
    {
      "front": "What is mitosis?",
      "back": "Cell division producing two identical daughter cells.",
      "hint": "Think: same number of chromosomes",
      "topic": "Cell Biology",
      "difficulty": "easy"
    }
  ]
}
difficulty must be one of: easy, medium, hard. hint is optional.`,
  ]
    .filter(Boolean)
    .join("\n");

  const { text } = await generateText({
    model: chatModel,
    prompt,
    maxTokens: 8000,
  });

  let cards: RawCard[];
  try {
    cards = validateGeneratedFlashcards(parseFlashcardJson(text), count);
  } catch (validationError) {
    const { text: repairedText } = await generateText({
      model: chatModel,
      prompt: [
        `Repair the flashcard JSON below. Return exactly ${count} unique cards.`,
        "Do not add facts that are absent from the study material.",
        "Every card requires front, back, topic, difficulty; hint may be null.",
        `Study material:\n${content.slice(0, 20000)}`,
        `Invalid response:\n${text.slice(0, 20000)}`,
        `Validation problem: ${
          validationError instanceof Error ? validationError.message : "invalid output"
        }`,
        "Return only the corrected JSON object.",
      ].join("\n\n"),
      maxTokens: 8000,
    });
    cards = validateGeneratedFlashcards(parseFlashcardJson(repairedText), count);
  }

  return cards.map((c) => ({
    ...c,
    id: uuidv4(),
    hint: c.hint ?? null,
  }));
}

/**
 * SM-2 Spaced Repetition Algorithm
 * Returns updated SRS fields based on the student's grade (0–5).
 *
 * Grade meanings:
 *   5 - Perfect response
 *   4 - Correct after hesitation
 *   3 - Correct with difficulty
 *   2 - Incorrect; easy recall
 *   1 - Incorrect; hard recall
 *   0 - Complete blackout
 */
export interface SRSUpdate {
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  next_review: string;
  times_correct: number;
  times_reviewed: number;
}

export function calculateNextReview(
  grade: SRSGrade,
  currentInterval: number,
  currentEase: number,
  currentReps: number,
  timesCorrect: number,
  timesReviewed: number
): SRSUpdate {
  const isCorrect = grade >= 3;
  let newInterval: number;
  let newEase = currentEase;
  let newReps = currentReps;

  if (!isCorrect) {
    // Failed — reset
    newInterval = 1;
    newReps = 0;
  } else {
    // Passed
    if (currentReps === 0) {
      newInterval = 1;
    } else if (currentReps === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(currentInterval * currentEase);
    }
    newReps = currentReps + 1;
  }

  // Update ease factor: EF' = EF + (0.1 - (5-q)*(0.08+(5-q)*0.02))
  newEase = Math.max(
    1.3,
    currentEase + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
  );

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + newInterval);

  return {
    interval_days: newInterval,
    ease_factor: Math.round(newEase * 100) / 100,
    repetitions: newReps,
    next_review: nextReview.toISOString(),
    times_correct: timesCorrect + (isCorrect ? 1 : 0),
    times_reviewed: timesReviewed + 1,
  };
}
