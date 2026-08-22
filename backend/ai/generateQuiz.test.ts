import { describe, expect, it } from "vitest";
import { normalizeGeneratedQuizQuestions } from "./generateQuiz";

const baseQuestion = {
  question: "Which statement best defines a base case in recursion?",
  type: "multiple_choice" as const,
  options: [
    "A condition that ends recursive calls",
    "The first function parameter",
    "A loop inside a function",
    "A compiler optimization",
  ],
  correct_answer: "A",
  explanation: "The base case stops the recursive chain.",
  topic: "Recursion",
  difficulty: "medium" as const,
  source_idx: 0,
};

describe("generated quiz validation", () => {
  it("normalizes answer letters and preserves valid source citations", () => {
    const result = normalizeGeneratedQuizQuestions(
      { questions: [baseQuestion] },
      { questionCount: 1, sourceCount: 1, topic: "Recursion" }
    );

    expect(result).toHaveLength(1);
    expect(result[0].correct_answer).toBe(
      "A condition that ends recursive calls"
    );
    expect(result[0].options).toHaveLength(4);
    expect(result[0].source_idx).toBe(0);
  });

  it("rejects malformed, duplicate, uncited, and fabricated true/false answers", () => {
    const result = normalizeGeneratedQuizQuestions(
      {
        questions: [
          { ...baseQuestion, options: ["One", "Two"], correct_answer: "One" },
          { ...baseQuestion, source_idx: 9 },
          {
            ...baseQuestion,
            question: "Is recursion always faster than iteration?",
            type: "true_false",
            options: ["True", "False"],
            correct_answer: "Sometimes",
          },
        ],
      },
      { questionCount: 3, sourceCount: 1, topic: "Recursion" }
    );

    expect(result).toEqual([]);
  });

  it("rejects logistics questions and wrong-language code", () => {
    const result = normalizeGeneratedQuizQuestions(
      {
        questions: [
          { ...baseQuestion, question: "What is the time limit for this quiz?" },
          {
            ...baseQuestion,
            question:
              "What does this code return?\n```python\nprint('wrong language')\n```",
          },
        ],
      },
      {
        courseLanguage: "Java",
        questionCount: 2,
        sourceCount: 1,
        topic: "Recursion",
      }
    );

    expect(result).toEqual([]);
  });

  it("keeps valid questions when another model item is malformed", () => {
    const validQuestion = {
      ...baseQuestion,
      question: "What role does a base case play in a recursive method?",
    };
    const result = normalizeGeneratedQuizQuestions(
      {
        questions: [
          { ...baseQuestion, difficulty: "adaptive" },
          validQuestion,
        ],
      },
      { questionCount: 2, sourceCount: 1, topic: "Recursion" }
    );

    expect(result).toHaveLength(1);
    expect(result[0].question).toBe(validQuestion.question);
  });
});
