import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertWithinLimit: vi.fn(),
  canvasDeepFetch: vi.fn(),
  from: vi.fn(),
  generateFlashcardsFromContent: vi.fn(),
  getUser: vi.fn(),
  runWithUsageContext: vi.fn(),
}));

vi.mock("@/backend/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  })),
}));
vi.mock("@/backend/billing/limits", () => ({
  assertWithinLimit: mocks.assertWithinLimit,
}));
vi.mock("@/backend/billing/usageContext", () => ({
  runWithUsageContext: mocks.runWithUsageContext,
}));
vi.mock("@/backend/canvas-intelligence/canvasDeepFetch", () => ({
  canvasDeepFetch: mocks.canvasDeepFetch,
}));
vi.mock("@/backend/ai/generateFlashcards", () => ({
  generateFlashcardsFromContent: mocks.generateFlashcardsFromContent,
}));

import { POST } from "@/app/api/flashcards/generate/route";

const courseId = "7c1c85d1-c03b-44af-84ed-1221d8ff5356";
const courseName = "2026FA Introduction to SGD (SGD-111-OAA1)";

describe("flashcard generation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "student-1" } },
    });
    mocks.assertWithinLimit.mockResolvedValue({ ok: true });
    mocks.runWithUsageContext.mockImplementation(
      async (_userId: string, generate: () => Promise<unknown>) => generate()
    );
    mocks.canvasDeepFetch.mockResolvedValue({
      ranked: [
        {
          confidence: 0.9,
          chunk: {
            title: "Course overview",
            text: "Core game-design concepts and terminology.",
            moduleName: null,
          },
        },
      ],
      hasDirectContent: true,
      moduleNames: [],
      warnings: [],
    });
    const generatedCard = {
      id: "card-1",
      front: "What is a core loop?",
      back: "The repeated sequence of actions that drives gameplay.",
      hint: null,
      topic: "Introduction to SGD",
      difficulty: "hard",
    };
    mocks.generateFlashcardsFromContent.mockResolvedValue([generatedCard]);

    const courseQuery: Record<string, ReturnType<typeof vi.fn>> = {};
    courseQuery.select = vi.fn(() => courseQuery);
    courseQuery.eq = vi.fn(() => courseQuery);
    courseQuery.single = vi.fn(async () => ({
      data: { name: courseName },
      error: null,
    }));
    const flashcardSelect = vi.fn(async () => ({
      data: [generatedCard],
      error: null,
    }));
    const flashcardQuery = {
      insert: vi.fn(() => ({ select: flashcardSelect })),
    };

    mocks.from.mockImplementation((table: string) => {
      if (table === "courses") return courseQuery;
      if (table === "flashcards") return flashcardQuery;
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("generates a course-wide deck when legacy optionals are null", async () => {
    const response = await POST(
      new Request("http://localhost/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteId: null,
          courseId,
          topic: null,
          count: 10,
          difficulty: "hard",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.canvasDeepFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "student-1",
        courseId,
        topic: courseName,
      })
    );
    expect(mocks.generateFlashcardsFromContent).toHaveBeenCalledWith(
      expect.stringContaining("Core game-design concepts"),
      courseName,
      10,
      courseName,
      "hard"
    );
  });
});
