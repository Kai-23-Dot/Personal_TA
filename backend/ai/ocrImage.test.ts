import { describe, expect, it } from "vitest";
import { parseBatchOCRResponse } from "./ocrImage";

describe("parseBatchOCRResponse", () => {
  it("keeps OCR text mapped to its source image", () => {
    expect(parseBatchOCRResponse(JSON.stringify({
      images: [
        { index: 1, extracted_text: "f(x) = x^2 + 3" },
        { index: 0, extracted_text: "Solve the triangle." },
      ],
    }), 2)).toEqual([
      { index: 1, extractedText: "f(x) = x^2 + 3" },
      { index: 0, extractedText: "Solve the triangle." },
    ]);
  });

  it("drops invalid, duplicate, and empty model entries", () => {
    expect(parseBatchOCRResponse(JSON.stringify({
      images: [
        { index: 0, text: "First" },
        { index: 0, text: "Duplicate" },
        { index: 8, text: "Out of range" },
        { index: 1, text: "" },
      ],
    }), 2)).toEqual([{ index: 0, extractedText: "First" }]);
  });
});
