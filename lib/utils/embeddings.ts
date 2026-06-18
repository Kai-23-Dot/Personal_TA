/**
 * Generate embeddings for semantic search / RAG.
 *
 * Priority order:
 *   1. Voyage AI  (voyage-3, 1536 dim) — set VOYAGE_API_KEY
 *   2. OpenAI     (text-embedding-3-small, 1536 dim) — uses existing OPENAI_API_KEY
 *   3. Zero vector fallback (dev only — semantic similarity will be 0)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const voyageKey = process.env.VOYAGE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const input = text.slice(0, 8191);

  // ── 1. Voyage AI (preferred when key is present) ───────────────────────────
  if (voyageKey) {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${voyageKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "voyage-3",
        input: [input.slice(0, 16000)],
      }),
    });
    if (!res.ok) throw new Error(`Voyage embeddings error ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return json.data[0].embedding as number[];
  }

  // ── 2. OpenAI text-embedding-3-small (1536 dim — same shape as Voyage) ────
  if (openaiKey) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input,
        dimensions: 1536,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI embeddings error ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return json.data[0].embedding as number[];
  }

  // ── 3. Zero-vector dev placeholder ────────────────────────────────────────
  console.warn(
    "[embeddings] No VOYAGE_API_KEY or OPENAI_API_KEY set — " +
    "using zero embedding (semantic similarity will be 0). " +
    "Set OPENAI_API_KEY in .env.local for full retrieval quality."
  );
  return new Array(1536).fill(0);
}
