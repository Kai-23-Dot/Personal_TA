import { describe, expect, it } from "vitest";
import { validateGeneratedFlashcards } from "./generateFlashcards";

const validCard = {
  front: "What is mitosis?",
  back: "Cell division that produces two genetically identical daughter cells.",
  hint: null,
  topic: "Cell Biology",
  difficulty: "easy" as const,
};

describe("flashcard AI output validation", () => {
  it("accepts an exact set of well-formed cards", () => {
    expect(
      validateGeneratedFlashcards(
        { cards: [validCard, { ...validCard, front: "Why is mitosis important?" }] },
        2
      )
    ).toHaveLength(2);
  });

  it("rejects wrong counts, duplicates, and invalid difficulty values", () => {
    expect(() => validateGeneratedFlashcards({ cards: [validCard] }, 2)).toThrow(
      /exactly 2/
    );
    expect(() =>
      validateGeneratedFlashcards({ cards: [validCard, validCard] }, 2)
    ).toThrow(/duplicate/);
    expect(() =>
      validateGeneratedFlashcards(
        { cards: [{ ...validCard, difficulty: "impossible" }] },
        1
      )
    ).toThrow(/invalid response/);
  });
});
