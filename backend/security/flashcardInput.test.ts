import { describe, expect, it } from "vitest";
import { flashcardGenerationSchema } from "./flashcardInput";

const courseId = "7c1c85d1-c03b-44af-84ed-1221d8ff5356";

describe("flashcard generation input", () => {
  it("normalizes null legacy optionals instead of rejecting the request", () => {
    const result = flashcardGenerationSchema.parse({
      noteId: null,
      courseId,
      topic: null,
      count: 10,
      difficulty: "hard",
    });

    expect(result.noteId).toBeUndefined();
    expect(result.topic).toBeUndefined();
    expect(result.courseId).toBe(courseId);
  });

  it("accepts a selected course when the optional topic is blank", () => {
    const result = flashcardGenerationSchema.safeParse({
      courseId,
      topic: "   ",
      count: 10,
      difficulty: "mixed",
    });

    expect(result.success).toBe(true);
  });

  it("uses safe defaults for null legacy count and difficulty values", () => {
    const result = flashcardGenerationSchema.parse({
      courseId,
      count: null,
      difficulty: null,
    });

    expect(result.count).toBe(10);
    expect(result.difficulty).toBe("mixed");
  });

  it("still rejects requests without any content source", () => {
    const result = flashcardGenerationSchema.safeParse({ topic: "Mitosis" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Select a course or note to generate flashcards."
    );
  });

  it("preserves exact Canvas item scope for a synthetic unit", () => {
    const result = flashcardGenerationSchema.parse({
      courseId,
      units: [{
        moduleId: 91,
        moduleName: "Unit 2- Population and Migration",
        source: "canvas",
        assignmentIds: [],
        noteIds: [],
        moduleItemIds: [201, 202, 203],
      }],
    });

    expect(result.units?.[0]?.moduleItemIds).toEqual([201, 202, 203]);
  });

  it("preserves a homepage unit's exact Canvas Page roots", () => {
    const result = flashcardGenerationSchema.parse({
      courseId,
      units: [{
        moduleId: null,
        moduleName: "Unit 1A",
        source: "canvas",
        assignmentIds: [],
        noteIds: [],
        moduleItemIds: [],
        pageSlugs: ["unit-1a"],
      }],
    });

    expect(result.units?.[0]?.pageSlugs).toEqual(["unit-1a"]);
  });
});
