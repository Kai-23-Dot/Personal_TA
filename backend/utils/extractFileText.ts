/**
 * extractFileText — extract plain text from PDF, DOCX, PPTX, and TXT buffers.
 *
 * Used by the LMS sync route to turn course files into searchable note content.
 *
 * Returns null if the file type is unsupported or extraction fails.
 */

export type SupportedFileType = "pdf" | "docx" | "pptx" | "txt";
export const MAX_EXTRACT_FILE_BYTES = 25 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 5000;
const MAX_XML_ENTRY_CHARS = 2_000_000;
const MAX_EXTRACTED_CHARS = 2_000_000;

/**
 * Detect file type from MIME type string.
 * Returns null for unsupported types.
 */
export function mimeToFileType(contentType: string): SupportedFileType | null {
  const ct = contentType.toLowerCase().split(";")[0].trim();
  if (ct === "application/pdf") return "pdf";
  if (ct === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (ct === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  if (ct === "text/plain") return "txt";
  return null;
}

/**
 * Detect file type from MIME first, then filename extension fallback.
 */
export function detectFileType(contentType: string, fileName?: string | null): SupportedFileType | null {
  const fromMime = mimeToFileType(contentType || "");
  if (fromMime) return fromMime;

  const lower = (fileName ?? "").toLowerCase().trim();
  if (!lower) return null;
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pptx")) return "pptx";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "txt";
  return null;
}

/**
 * Extract plain text from a file buffer.
 * @param buffer  Raw file bytes
 * @param type    One of "pdf" | "docx" | "pptx" | "txt"
 * @returns Extracted text, or null on failure
 */
export async function extractFileText(
  buffer: Buffer,
  type: SupportedFileType
): Promise<string | null> {
  if (!buffer.length || buffer.length > MAX_EXTRACT_FILE_BYTES) return null;
  try {
    switch (type) {
      case "pdf":
        return await extractPdf(buffer);
      case "docx":
        return await extractDocx(buffer);
      case "pptx":
        return await extractPptx(buffer);
      case "txt":
        return normalizeExtractedText(buffer.toString("utf8"));
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function normalizeExtractedText(text: string): string | null {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_EXTRACTED_CHARS);
  return normalized || null;
}

// ── PDF ──────────────────────────────────────────────────────────────────────

async function extractPdf(buffer: Buffer): Promise<string | null> {
  const pdfParse = (await import("pdf-parse")).default as (buf: Buffer) => Promise<{ text: string }>;
  const data = await pdfParse(buffer);
  return normalizeExtractedText(data.text);
}

// ── DOCX ─────────────────────────────────────────────────────────────────────

async function extractDocx(buffer: Buffer): Promise<string | null> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return normalizeExtractedText(result.value);
}

// ── PPTX ─────────────────────────────────────────────────────────────────────

async function extractPptx(buffer: Buffer): Promise<string | null> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  if (Object.keys(zip.files).length > MAX_ARCHIVE_ENTRIES) return null;

  // Collect slide XML files in slide order
  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
      const numB = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
      return numA - numB;
    });

  const slideTexts: string[] = [];
  let extractedChars = 0;

  const decodeXmlText = (value: string) =>
    value
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
        String.fromCodePoint(Number.parseInt(hex, 16))
      )
      .replace(/&#(\d+);/g, (_, decimal: string) =>
        String.fromCodePoint(Number.parseInt(decimal, 10))
      )
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");

  const textRuns = (xml: string): string[] =>
    [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
      .map((match) => decodeXmlText(match[1]).replace(/\s+/g, " ").trim())
      .filter(Boolean);

  for (let i = 0; i < slideEntries.length; i++) {
    const xml = await zip.files[slideEntries[i]].async("string");
    if (xml.length > MAX_XML_ENTRY_CHARS) return null;
    const texts = textRuns(xml);

    const slideNumber = Number.parseInt(
      slideEntries[i].match(/slide(\d+)\.xml$/)?.[1] ?? String(i + 1),
      10
    );
    const notesEntry = zip.files[`ppt/notesSlides/notesSlide${slideNumber}.xml`];
    let notes: string[] = [];
    if (notesEntry) {
      const notesXml = await notesEntry.async("string");
      if (notesXml.length > MAX_XML_ENTRY_CHARS) return null;
      notes = textRuns(notesXml).filter(
        (value) => !/^(slide image|slide number)$/i.test(value)
      );
    }

    if (texts.length > 0 || notes.length > 0) {
      const section = [
        `[Slide ${slideNumber}]`,
        texts.join(" "),
        notes.length > 0 ? `[Speaker Notes]\n${notes.join(" ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      extractedChars += section.length;
      if (extractedChars > MAX_EXTRACTED_CHARS) return null;
      slideTexts.push(section);
    }
  }

  return normalizeExtractedText(slideTexts.join("\n\n"));
}
