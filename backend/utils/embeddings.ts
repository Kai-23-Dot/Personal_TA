/**
 * Generate embeddings for semantic search / RAG.
 *
 * Priority order:
 *   1. Voyage AI  (voyage-3, 1536 dim) — set VOYAGE_API_KEY
 *   2. OpenAI     (text-embedding-3-small, 1536 dim) — uses existing OPENAI_API_KEY
 *   3. Zero vector fallback (dev only — semantic similarity will be 0)
 */
const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_BATCH_SIZE = 32;

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[]; index?: number }>;
};

async function requestEmbeddingBatch(
  inputs: string[],
  provider: "openai" | "voyage",
  apiKey: string
): Promise<number[][]> {
  const isVoyage = provider === "voyage";
  const res = await fetch(
    isVoyage
      ? "https://api.voyageai.com/v1/embeddings"
      : "https://api.openai.com/v1/embeddings",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: isVoyage ? "voyage-3" : "text-embedding-3-small",
        input: inputs,
        ...(!isVoyage ? { dimensions: EMBEDDING_DIMENSIONS } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    }
  );
  if (!res.ok) {
    throw new Error(
      `${isVoyage ? "Voyage" : "OpenAI"} embeddings request failed with status ${res.status}.`
    );
  }

  const json = await res.json() as EmbeddingResponse;
  const ordered = [...(json.data ?? [])].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0)
  );
  if (
    ordered.length !== inputs.length ||
    ordered.some(
      (item) =>
        !Array.isArray(item.embedding) ||
        item.embedding.length === 0 ||
        item.embedding.length > 4096 ||
        item.embedding.some((value) => !Number.isFinite(value))
    )
  ) {
    throw new Error("Embedding provider returned an invalid response.");
  }
  return ordered.map((item) => {
    const embedding = (item.embedding as number[]).slice(
      0,
      EMBEDDING_DIMENSIONS
    );
    if (embedding.length < EMBEDDING_DIMENSIONS) {
      embedding.push(
        ...new Array(EMBEDDING_DIMENSIONS - embedding.length).fill(0)
      );
    }
    return embedding;
  });
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const voyageKey = process.env.VOYAGE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const inputs = texts.map((text) => text.slice(0, voyageKey ? 16_000 : 8191));
  if (inputs.length === 0) return [];

  const provider = voyageKey
    ? { apiKey: voyageKey, name: "voyage" as const }
    : openaiKey
      ? { apiKey: openaiKey, name: "openai" as const }
      : null;
  if (provider) {
    const embeddings: number[][] = [];
    for (let start = 0; start < inputs.length; start += EMBEDDING_BATCH_SIZE) {
      embeddings.push(
        ...(await requestEmbeddingBatch(
          inputs.slice(start, start + EMBEDDING_BATCH_SIZE),
          provider.name,
          provider.apiKey
        ))
      );
    }
    return embeddings;
  }

  // ── 3. Zero-vector dev placeholder ────────────────────────────────────────
  if (process.env.NODE_ENV === "production") {
    throw new Error("Embedding provider is not configured.");
  }
  console.warn(
    "[embeddings] No VOYAGE_API_KEY or OPENAI_API_KEY set — " +
    "using zero embedding (semantic similarity will be 0). " +
    "Set OPENAI_API_KEY in .env.local for full retrieval quality."
  );
  return inputs.map(() => new Array(EMBEDDING_DIMENSIONS).fill(0));
}

export async function generateEmbedding(text: string): Promise<number[]> {
  return (await generateEmbeddings([text]))[0];
}
