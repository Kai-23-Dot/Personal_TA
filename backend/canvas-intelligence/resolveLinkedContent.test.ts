import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ url: vi.fn(), google: vi.fn() }));
vi.mock("@/backend/utils/extractUrlText", () => ({ extractUrlText: mocks.url }));
vi.mock("./contentExtractor", async (importOriginal) => ({
  ...await importOriginal<typeof import("./contentExtractor")>(),
  extractFromGoogleLink: mocks.google,
}));
import { resolveLinkedContent } from "./resolveLinkedContent";
import type { CanvasContentItem } from "./types";

function item(id: string, overrides: Partial<CanvasContentItem> = {}): CanvasContentItem {
  return { id, title: id, courseId: "course", canvasCourseId: 1, type: "external_link", sourceType: "external_link", linkedFromModule: true, extractionStatus: "pending", metadata: {}, ...overrides };
}
const options = { canvasDomain: "school.instructure.com" };

describe("Canvas linked source ingestion", () => {
  beforeEach(() => vi.resetAllMocks());

  it("resolves website and video placeholders, deduplicates downloads and retains actual content", async () => {
    mocks.url.mockImplementation(async (url: string) => ({ text: `Extracted ${url}` }));
    const result = await resolveLinkedContent([
      item("site", { externalUrl: "https://example.com/lesson", textContent: "https://example.com/lesson" }),
      item("same", { externalUrl: "https://example.com/lesson#section" }),
      item("video", { type: "external_video", externalUrl: "https://youtu.be/abcdefghijk", textContent: "youtube video: https://youtu.be/abcdefghijk", extractionStatus: "metadata_only" }),
      item("pdf", { type: "file", textContent: "Already extracted PDF text", extractionStatus: "extracted" }),
    ], options);
    expect(mocks.url).toHaveBeenCalledTimes(2);
    expect(result.texts.get("site")).toBe("Extracted https://example.com/lesson");
    expect(result.texts.get("same")).toBe(result.texts.get("site"));
    expect(result.texts.get("video")).toContain("Extracted");
    expect(result.texts.get("pdf")).toBe("Already extracted PDF text");
    expect(result.errors).toEqual([]);
  });

  it("isolates failures and never stores failed URL or video metadata as study text", async () => {
    mocks.url.mockRejectedValueOnce(new Error("Captions unavailable")).mockResolvedValueOnce({ text: "Readable lesson" });
    const result = await resolveLinkedContent([
      item("broken", { externalUrl: "https://youtu.be/abcdefghijk", textContent: "youtube video: https://youtu.be/abcdefghijk" }),
      item("good", { externalUrl: "https://example.com/lesson" }),
      item("canvas", { type: "canvas_page", externalUrl: "https://school.instructure.com/courses/1/pages/intro", textContent: "https://school.instructure.com/courses/1/pages/intro" }),
    ], options);
    expect([...result.texts]).toEqual([["good", "Readable lesson"]]);
    expect(result.errors).toEqual(["Linked material (broken): Captions unavailable"]);
    expect(mocks.url).toHaveBeenCalledTimes(2);
  });

  it("preserves Google OAuth extraction and bounds the number of remote sources", async () => {
    mocks.google.mockResolvedValue("Google lesson text");
    mocks.url.mockResolvedValue({ text: "Web lesson text" });
    const result = await resolveLinkedContent([
      item("google", { externalUrl: "https://docs.google.com/document/d/abcdefghijk123/edit" }),
      ...Array.from({ length: 10 }, (_, i) => item(`site${i}`, { externalUrl: `https://example.com/${i}` })),
    ], { ...options, oauthAccessToken: "test-token" });
    expect(mocks.google).toHaveBeenCalledWith(expect.objectContaining({ oauthAccessToken: "test-token" }));
    expect(mocks.url).toHaveBeenCalledTimes(7);
    expect(result.texts.get("google")).toBe("Google lesson text");
    expect(result.errors).toContain("Linked material extraction is limited to 8 unique URLs per course sync.");
  });
});
