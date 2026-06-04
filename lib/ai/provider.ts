/**
 * Sarvam AI provider for all AI model calls.
 *
 * Uses the Vercel AI SDK @ai-sdk/openai adapter with Sarvam's OpenAI-compatible API.
 * Set SARVAM_API_KEY in your .env.local.
 *
 * Get a key at: https://app.sarvam.ai
 */
import { createOpenAI } from "@ai-sdk/openai";

const sarvam = createOpenAI({
  baseURL: "https://api.sarvam.ai/v1",
  // Sarvam uses api-subscription-key header instead of Bearer auth — overridden via fetch below
  apiKey: "x",
  fetch: async (url, init) => {
    const headers = new Headers(init?.headers);
    headers.delete("authorization");
    headers.set("api-subscription-key", process.env.SARVAM_API_KEY ?? "");
    return fetch(url, { ...init, headers });
  },
});

/** Primary model — used for chat, quiz generation, summarization, flashcards, and vision */
export const chatModel = sarvam("sarvam-30b");

/** Lightweight model — used for quick structured extraction tasks */
export const fastModel = sarvam("sarvam-30b");
