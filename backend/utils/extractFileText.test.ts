import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  detectFileType,
  extractFileText,
  mimeToFileType,
} from "./extractFileText";

describe("file text extraction", () => {
  it("does not misclassify legacy binary .ppt files as PPTX", () => {
    expect(mimeToFileType("application/vnd.ms-powerpoint")).toBeNull();
    expect(detectFileType("application/octet-stream", "lesson.ppt")).toBeNull();
    expect(detectFileType("application/octet-stream", "lesson.pptx")).toBe(
      "pptx"
    );
  });

  it("extracts PPTX slides in order, decodes XML, and includes speaker notes", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide2.xml",
      "<p:sld><a:t>Second &amp; final</a:t></p:sld>"
    );
    zip.file(
      "ppt/slides/slide1.xml",
      "<p:sld><a:t>First &lt;topic&gt;</a:t></p:sld>"
    );
    zip.file(
      "ppt/notesSlides/notesSlide1.xml",
      "<p:notes><a:t>Remember the key definition.</a:t></p:notes>"
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    const text = await extractFileText(buffer, "pptx");
    expect(text).toContain("[Slide 1]\nFirst <topic>");
    expect(text).toContain("[Speaker Notes]\nRemember the key definition.");
    expect(text).toContain("[Slide 2]\nSecond & final");
    expect(text?.indexOf("[Slide 1]")).toBeLessThan(
      text?.indexOf("[Slide 2]") ?? 0
    );
  });
});
