import type { DocumentChunk, ExtractedDocument } from "./types";

const TARGET_CHARS = 1200;

export function chunkDocument(doc: ExtractedDocument): DocumentChunk[] {
  const sections = doc.normalizedContent.split(/\n(?=#|[A-Z][^\n]{0,80}:)/g).filter(Boolean);
  const chunks: string[] = [];
  let buffer = "";

  for (const section of sections) {
    const candidate = buffer ? `${buffer}\n${section}` : section;
    if (candidate.length > TARGET_CHARS && buffer) {
      chunks.push(buffer);
      buffer = section;
    } else {
      buffer = candidate;
    }
  }
  if (buffer.trim()) chunks.push(buffer);

  return chunks.map((text, idx) => ({
    id: `${doc.id}_chunk_${idx}`,
    documentId: doc.id,
    courseId: doc.courseId,
    title: doc.title,
    chunkIndex: idx,
    text,
    category: doc.category,
    sourceType: doc.sourceType,
    sourceUrl: doc.sourceUrl,
    moduleName: doc.moduleName,
    dueAt: doc.dueAt,
    updatedAt: doc.updatedAt,
    tags: doc.tags,
    metadata: doc.metadata,
  }));
}
