import { describe, expect, it } from "vitest";
import {
  assessInstructionalContent,
  generatedQuestionIsGrounded,
  hasEnoughInstructionalCoverage,
  normalizePracticeMath,
  sourceExcerptIsGrounded,
} from "./sourceGrounding";

describe("Canvas practice source grounding", () => {
  it("rejects a unit title and navigation links as instructional evidence", () => {
    const assessment = assessInstructionalContent(
      "Unit 1A Polynomial Functions 2026 2027 Home Assignments Modules Grades",
      { title: "Unit 1A Polynomial Functions 2026 2027", moduleName: "Unit 1A" }
    );
    expect(assessment.usable).toBe(false);
    expect(assessment.reason).toBe("metadata_only");
  });

  it("rejects a long Canvas page made only of linked resource titles", () => {
    const assessment = assessInstructionalContent(
      "Lesson Notes Polynomial Vocabulary Homework Practice Problems Guided Notes Desmos Activity Review Worksheet Answer Key Quiz Preparation Unit Checklist Video Tutorial Extra Practice Calculator Instructions Course Resources",
      { sourceType: "canvas_page", moduleName: "Unit 1A" }
    );
    expect(assessment.usable).toBe(false);
  });

  it("accepts OCR transcription containing worked math content", () => {
    const assessment = assessInstructionalContent(
      "Example: f(x) = (x - 3)^2(x + 1). The zero x = 3 has even multiplicity, so the graph touches the x-axis and turns around. The zero x = -1 has odd multiplicity, so the graph crosses the axis.",
      { sourceType: "image", visionExtracted: true }
    );
    expect(assessment.usable).toBe(true);
  });

  it("requires enough real evidence for the requested question count", () => {
    const short = assessInstructionalContent(
      "A polynomial function has zeros. Use its factored form to identify each zero and determine multiplicity from the exponent.",
      { sourceType: "image", visionExtracted: true }
    );
    expect(short.usable).toBe(true);
    expect(hasEnoughInstructionalCoverage([short], 10)).toBe(false);
    expect(hasEnoughInstructionalCoverage([short], 2)).toBe(true);
  });

  it("accepts only excerpts that occur in the cited source", () => {
    const source = "An even multiplicity makes the graph touch the x-axis and turn around.";
    expect(sourceExcerptIsGrounded("graph touch the x-axis and turn around", source)).toBe(true);
    expect(sourceExcerptIsGrounded("the graph crosses through the axis", source)).toBe(false);
  });

  it("rejects a cited but unsupported question", () => {
    const source = "An even multiplicity makes the graph touch the x-axis and turn around.";
    expect(generatedQuestionIsGrounded({
      question: "What is the end behavior of an odd-degree polynomial?",
      correctAnswer: "Its ends move in opposite directions.",
      sourceText: source,
      sourceExcerpt: "even multiplicity makes the graph touch the x-axis",
    })).toBe(false);
  });

  it("removes unsupported LaTeX wrappers without changing the expression", () => {
    expect(normalizePracticeMath("The graph meets \\( x = 3 \\)."))
      .toBe("The graph meets x = 3.");
  });
});
