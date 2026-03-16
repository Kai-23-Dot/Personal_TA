/**
 * Generate embeddings using Anthropic's voyage-3 model via the embeddings endpoint.
 * Fallback: if VOYAGE_API_KEY is not set, uses a deterministic zero vector
 * for development so the rest of the pipeline still works.
 *
 * In production, sign up at https://www.voyageai.com/ and add VOYAGE_API_KEY.
 * Alternatively replace with OpenAI text-embedding-3-small by changing the
 * fetch URL and body shape.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;

  if (!apiKey) {
    // Dev-only placeholder — returns 1536 zeros
    console.warn("[embeddings] VOYAGE_API_KEY not set — using zero embedding");
    return new Array(1536).fill(0);
  }

  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "voyage-3",
      input: [text.slice(0, 16000)], // Voyage 3 context limit
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Voyage embeddings error ${res.status}: ${err}`);
  }

  const json = await res.json();
  return json.data[0].embedding as number[];
}
