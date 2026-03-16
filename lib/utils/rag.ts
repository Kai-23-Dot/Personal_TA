import { createServiceClient } from "@/lib/supabase/server";
import { generateEmbedding } from "./embeddings";

export interface RagResult {
  id: string;
  title?: string;
  content: string;
  course_id: string | null;
  similarity: number;
  source: "note" | "summary";
}

/**
 * Retrieves the most relevant notes and summaries for a given query.
 * Uses pgvector cosine similarity search.
 */
export async function retrieveRelevantContext(
  userId: string,
  query: string,
  limit = 5
): Promise<RagResult[]> {
  const embedding = await generateEmbedding(query);
  const embeddingStr = `[${embedding.join(",")}]`;

  const supabase = createServiceClient();

  const [{ data: notes }, { data: summaries }] = await Promise.all([
    supabase.rpc("match_notes", {
      query_embedding: embeddingStr,
      match_user_id: userId,
      match_count: Math.ceil(limit / 2),
      similarity_threshold: 0.5,
    }),
    supabase.rpc("match_summaries", {
      query_embedding: embeddingStr,
      match_user_id: userId,
      match_count: Math.ceil(limit / 2),
      similarity_threshold: 0.5,
    }),
  ]);

  const noteResults: RagResult[] = (notes ?? []).map((n: {
    id: string;
    title: string;
    content: string;
    course_id: string | null;
    similarity: number;
  }) => ({
    id: n.id,
    title: n.title,
    content: n.content?.slice(0, 2000) ?? "",
    course_id: n.course_id,
    similarity: n.similarity,
    source: "note" as const,
  }));

  const summaryResults: RagResult[] = (summaries ?? []).map((s: {
    id: string;
    content: string;
    note_id: string | null;
    course_id: string | null;
    similarity: number;
  }) => ({
    id: s.id,
    title: undefined,
    content: s.content?.slice(0, 2000) ?? "",
    course_id: s.course_id,
    similarity: s.similarity,
    source: "summary" as const,
  }));

  return [...noteResults, ...summaryResults]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export function formatContextForPrompt(results: RagResult[]): string {
  if (results.length === 0) return "";

  const sections = results.map((r) => {
    const sourceLabel = r.source === "note" ? "Note" : "Summary";
    const titlePart = r.title ? ` — "${r.title}"` : "";
    return `[${sourceLabel}${titlePart}]\n${r.content}`;
  });

  return `\n\n--- STUDENT'S OWN NOTES & SUMMARIES ---\n${sections.join("\n\n---\n")}\n--- END OF STUDENT NOTES ---\n`;
}
