import { describe, expect, it } from "vitest";
import {
  sanitizeUploadFileName,
  validateNoteUpload,
} from "./uploadValidation";

describe("note upload validation", () => {
  it("sanitizes path fragments and control characters", () => {
    expect(sanitizeUploadFileName("../folder\\bad\u0000 name.pdf")).toBe(
      "bad name.pdf"
    );
  });

  it("rejects mismatched media types and oversized files", () => {
    expect(() =>
      validateNoteUpload({
        name: "notes.pdf",
        size: 100,
        type: "image/png",
      })
    ).toThrow(/does not match/);
    expect(() =>
      validateNoteUpload({
        name: "notes.txt",
        size: 6 * 1024 * 1024,
        type: "text/plain",
      })
    ).toThrow(/5 MB/);
  });
});
