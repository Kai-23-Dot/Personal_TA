import { generateEmbedding } from "@/backend/utils/embeddings";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Turning an imported source into a note the rest of the app can already use.
 *
 * Everything downstream — study guides, practice generation, flashcards, the
 * assistant's retrieval — reads the `notes` table and its embedding. So an
 * imported PDF, web page or video transcript does not need a pipeline of its
 * own: it needs to arrive as a note with its text extracted and embedded, and
 * every one of those features starts working on it for free.
 *
 * This is the one place that writes such a row, so the fields those features
 * depend on cannot be set inconsistently by one importer and not another.
 */

/** Matches the embedding window the uploader already uses. */
const EMBEDDING_CHARS = 8_000;

/** Guards against a runaway page or transcript filling a row. */
export const MAX_SOURCE_CHARS = 400_000;

export type SourceKind = "url" | "youtube";

export interface IngestSourceInput {
  userId: string;
  notebookId: string;
  /** Inherited from the notebook, so generated material lands in the course. */
  courseId: string | null;
  title: string;
  content: string;
  sourceUrl: string;
  kind: SourceKind;
}

export interface IngestedSource {
  id: string;
  title: string;
  wordCount: number;
  embedded: boolean;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export async function ingestSource(
  supabase: SupabaseClient,
  input: IngestSourceInput
): Promise<IngestedSource> {
  const content = input.content.trim().slice(0, MAX_SOURCE_CHARS);
  if (!content) {
    throw new Error("No readable text was found at that address.");
  }

  // A failed embedding costs semantic search on this one source; it must not
  // cost the import itself, because the text is still useful to every feature
  // that reads a note by id rather than by similarity.
  let embedding: number[] | null = null;
  try {
    embedding = await generateEmbedding(content.slice(0, EMBEDDING_CHARS));
  } catch (error) {
    console.warn("[notebooks] Embedding failed; importing without it:", error);
  }

  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: input.userId,
      notebook_id: input.notebookId,
      course_id: input.courseId,
      title: input.title.slice(0, 200),
      content,
      source_type: input.kind,
      source_url: input.sourceUrl.slice(0, 2000),
      file_type: input.kind === "youtube" ? "video" : "link",
      word_count: countWords(content),
      is_processed: true,
      embedding: embedding ? `[${embedding.join(",")}]` : null,
    })
    .select("id, title, word_count")
    .single();

  if (error) {
    console.error("[notebooks] Source insert failed:", error);
    throw new Error("Could not save that source.");
  }

  return {
    id: data.id,
    title: data.title,
    wordCount: data.word_count ?? 0,
    embedded: embedding !== null,
  };
}
