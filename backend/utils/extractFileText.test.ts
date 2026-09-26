import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  detectFileType,
  extractFileText,
  mimeToFileType,
} from "./extractFileText";

function createPdfWithText(text: string): Buffer {
  const escapedText = text.replace(/([\\()])/g, "\\$1");
  const stream = `BT /F1 12 Tf 72 720 Td (${escapedText}) Tj ET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  let pdf = "%PDF-1.4\n%0000\n";
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf);
}

describe("file text extraction", () => {
  it("extracts readable PDF text from an uploaded Buffer", async () => {
    const expected = "Conlearn PDF capability verification";
    const buffer = createPdfWithText(expected);

    expect(await extractFileText(buffer, "pdf")).toBe(expected);
  });

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
