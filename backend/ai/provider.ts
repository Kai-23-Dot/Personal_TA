/**
 * OpenAI provider for all AI model calls.
 *
 * Uses the Vercel AI SDK @ai-sdk/openai adapter with the standard OpenAI API.
 * Set OPENAI_API_KEY in your .env.local.
 */
import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

/** Primary model — used for chat, quiz generation, summarization, flashcards, and vision */
export const chatModel = openai("gpt-4.1-mini");

/** Lightweight model — used for quick structured extraction tasks */
export const fastModel = openai("gpt-4.1-mini");
