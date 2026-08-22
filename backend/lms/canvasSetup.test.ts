import { describe, expect, it } from "vitest";
import { canvasSettingsUrl, normalizeCanvasHostInput } from "./canvasSetup";

describe("Canvas setup input", () => {
  it.each([
    ["School.Instructure.com", "school.instructure.com"],
    ["https://school.instructure.com", "school.instructure.com"],
    ["https://school.instructure.com/courses/123", "school.instructure.com"],
    ["https://canvas.example.edu/profile/settings", "canvas.example.edu"],
  ])("extracts a Canvas host from %s", (input, expected) => {
    expect(normalizeCanvasHostInput(input)).toBe(expected);
  });

  it("builds the direct Canvas settings link", () => {
    expect(canvasSettingsUrl("school.instructure.com/courses/123")).toBe(
      "https://school.instructure.com/profile/settings"
    );
  });

  it.each(["", "not-a-host", "http://school.instructure.com", "https://user:pass@school.instructure.com"])(
    "rejects unsafe or incomplete input: %s",
    (input) => expect(() => normalizeCanvasHostInput(input)).toThrow()
  );
});
