/**
 * extractFileText — extract plain text from PDF, DOCX, PPTX, and TXT buffers.
 *
 * Used by the LMS sync route to turn course files into searchable note content.
 *
 * Returns null if the file type is unsupported or extraction fails.
 */

export type SupportedFileType = "pdf" | "docx" | "pptx" | "txt";

/**
 * Detect file type from MIME type string.
 * Returns null for unsupported types.
 */
export function mimeToFileType(contentType: string): SupportedFileType | null {
  const ct = contentType.toLowerCase().split(";")[0].trim();
  if (ct === "application/pdf") return "pdf";
  if (ct === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (ct === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
  if (ct === "application/vnd.ms-powerpoint") return "pptx"; // best-effort for legacy PowerPoint
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
  if (lower.endsWith(".pptx") || lower.endsWith(".ppt")) return "pptx";
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
  try {
    switch (type) {
      case "pdf":
        return await extractPdf(buffer);
      case "docx":
        return await extractDocx(buffer);
      case "pptx":
        return await extractPptx(buffer);
      case "txt":
        return buffer.toString("utf8").trim() || null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ── PDF ──────────────────────────────────────────────────────────────────────

async function extractPdf(buffer: Buffer): Promise<string | null> {
  const pdfParse = (await import("pdf-parse")).default as (buf: Buffer) => Promise<{ text: string }>;
  const data = await pdfParse(buffer);
  const text = data.text.replace(/\s+/g, " ").trim();
  return text || null;
}

// ── DOCX ─────────────────────────────────────────────────────────────────────

async function extractDocx(buffer: Buffer): Promise<string | null> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.replace(/\s+/g, " ").trim();
  return text || null;
}

// ── PPTX ─────────────────────────────────────────────────────────────────────

async function extractPptx(buffer: Buffer): Promise<string | null> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);

  // Collect slide XML files in slide order
  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
      const numB = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
      return numA - numB;
    });

  const slideTexts: string[] = [];

  for (let i = 0; i < slideEntries.length; i++) {
    const xml = await zip.files[slideEntries[i]].async("string");
    // Extract all <a:t> text runs
    const matches = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)];
    const texts = matches.map((m) => m[1].trim()).filter(Boolean);
    if (texts.length > 0) {
      slideTexts.push(`[Slide ${i + 1}]\n${texts.join(" ")}`);
    }
  }

  const combined = slideTexts.join("\n\n").trim();
  return combined || null;
}
