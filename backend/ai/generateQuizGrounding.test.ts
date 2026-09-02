import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
}));

vi.mock("ai", () => ({ generateText: mocks.generateText }));
vi.mock("./provider", () => ({ chatModel: {} }));

import { generateQuiz, QuizGroundingError } from "./generateQuiz";

const sourceText =
  "An even multiplicity makes the graph touch the x-axis and turn around. An odd multiplicity makes the graph cross the x-axis.";

function response(sourceExcerpt: string) {
  return {
    text: JSON.stringify({
      questions: [{
        question: "How does a graph behave at a zero with even multiplicity?",
        type: "multiple_choice",
        options: [
          "It touches the x-axis and turns around",
          "It crosses the x-axis",
          "It has a vertical asymptote",
          "It becomes undefined",
        ],
        correct_answer: "It touches the x-axis and turns around",
        explanation: "The Canvas notes state that an even multiplicity makes the graph touch and turn.",
        topic: "Unit 1A",
        difficulty: "easy",
        source_idx: 0,
        source_excerpt: sourceExcerpt,
      }],
    }),
  };
}

describe("closed-book quiz generation", () => {
  beforeEach(() => mocks.generateText.mockReset());

  it("accepts a question grounded in an exact Canvas excerpt", async () => {
    mocks.generateText.mockResolvedValue(response(
      "even multiplicity makes the graph touch the x-axis and turn around"
    ));

    const questions = await generateQuiz({
      topic: "Unit 1A",
      difficulty: "easy",
      questionCount: 1,
      courseName: "AP Precalculus",
      isAP: true,
      courseNotes: `### [0] Unit notes\n${sourceText}`,
      sources: [{ idx: 0, title: "Unit notes", content: sourceText }],
      lowTokenMode: true,
    });

    expect(questions).toHaveLength(1);
    const prompt = String(mocks.generateText.mock.calls[0]?.[0]?.prompt);
    expect(prompt).toContain("ONLY factual source");
    expect(prompt).toContain("Do not use the internet, pretrained/general knowledge");
    expect(prompt).toContain("source_excerpt");
    expect(prompt).not.toContain("supplementary context");
  });

  it("rejects both initial and repair responses when their evidence is fabricated", async () => {
    mocks.generateText.mockResolvedValue(response(
      "The graph has a vertical asymptote at every repeated zero"
    ));

    await expect(generateQuiz({
      topic: "Unit 1A",
      difficulty: "easy",
      questionCount: 1,
      courseNotes: `### [0] Unit notes\n${sourceText}`,
      sources: [{ idx: 0, title: "Unit notes", content: sourceText }],
      lowTokenMode: true,
    })).rejects.toBeInstanceOf(QuizGroundingError);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
  });
});
