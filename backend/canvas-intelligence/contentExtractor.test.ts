import { describe, expect, it } from "vitest";
import { parseGoogleDriveLink } from "./contentExtractor";

describe("Google Drive link parsing", () => {
  it("recognizes Docs, Slides, Drive file, and query-id links", () => {
    expect(
      parseGoogleDriveLink(
        "https://docs.google.com/document/d/abcdefghijk12345/edit"
      )
    ).toEqual({ id: "abcdefghijk12345", kind: "document" });
    expect(
      parseGoogleDriveLink(
        "https://docs.google.com/presentation/d/slides123456789/edit"
      )
    ).toEqual({ id: "slides123456789", kind: "presentation" });
    expect(
      parseGoogleDriveLink(
        "https://drive.google.com/file/d/file1234567890/view"
      )
    ).toEqual({ id: "file1234567890", kind: "file" });
    expect(
      parseGoogleDriveLink(
        "https://drive.google.com/open?id=query123456789"
      )
    ).toEqual({ id: "query123456789", kind: "file" });
  });

  it("rejects lookalike hosts and non-HTTPS links", () => {
    expect(
      parseGoogleDriveLink(
        "https://drive.google.com.attacker.example/file/d/file1234567890/view"
      )
    ).toBeNull();
    expect(
      parseGoogleDriveLink(
        "http://drive.google.com/file/d/file1234567890/view"
      )
    ).toBeNull();
  });
});
