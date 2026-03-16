import { generateText } from "ai";
import { chatModel } from "./provider";
import { v4 as uuidv4 } from "uuid";
import type { SRSGrade } from "@/types";

export interface GeneratedFlashcard {
  id: string;
  front: string;
  back: string;
  hint: string | null;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
}

type RawCard = {
  front: string;
  back: string;
  hint?: string | null;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
};

export async function generateFlashcardsFromContent(
  content: string,
  topic: string,
  count: number = 10,
  courseName?: string
): Promise<GeneratedFlashcard[]> {
  const prompt = [
    `Create ${count} flashcards for a high school student.`,
    courseName ? `Course: ${courseName}` : null,
    `Topic: ${topic}`,
    `Rules: concise fronts (question or term), complete backs (answer/definition), hint when tricky.`,
    `Mix: definitions, concept explanations, formulas, comparisons.`,
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

  const stripped = text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error("Flashcard generation failed: no JSON object in response");
  }

  let cards: RawCard[] = [];
  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1));
    cards = parsed.cards ?? [];
  } catch {
    throw new Error("Flashcard generation failed: could not parse AI response as JSON");
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
