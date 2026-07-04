/**
 * OpenAI provider for all AI model calls.
 *
 * Uses the Vercel AI SDK @ai-sdk/openai adapter with the standard OpenAI API.
 * Set OPENAI_API_KEY in your .env.local.
 *
 * All models are wrapped with token-metering middleware so that every AI call
 * records its token usage against the current request's user (see
 * backend/billing/usageContext.ts). Metering is best-effort and never blocks
 * or fails a model call.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { wrapLanguageModel, type LanguageModelV1, type LanguageModelV1Middleware } from "ai";
import { getUsageUserId } from "@/backend/billing/usageContext";
import { recordUsage } from "@/backend/billing/limits";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

function report(userId: string | null, totalTokens: number | undefined) {
  if (!userId || !totalTokens || totalTokens <= 0) return;
  // Fire-and-forget; recordUsage swallows its own errors.
  void recordUsage(userId, "tokens", totalTokens);
}

const meteringMiddleware: LanguageModelV1Middleware = {
  async wrapGenerate({ doGenerate }) {
    // Context is active for the duration of the awaited generate call.
    const userId = getUsageUserId();
    const result = await doGenerate();
    const usage = result.usage;
    report(userId, (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0));
    return result;
  },
  async wrapStream({ doStream }) {
    // Capture the user now (context is active at stream setup). The `finish`
    // chunk is consumed later, outside the AsyncLocalStorage scope.
    const userId = getUsageUserId();
    const { stream, ...rest } = await doStream();
    const tap = new TransformStream({
      transform(chunk, controller) {
        if (chunk.type === "finish") {
          const usage = chunk.usage;
          report(userId, (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0));
        }
        controller.enqueue(chunk);
      },
    });
    return { stream: stream.pipeThrough(tap), ...rest };
  },
};

function metered(model: LanguageModelV1): LanguageModelV1 {
  return wrapLanguageModel({ model, middleware: meteringMiddleware });
}

/** Primary model — used for chat, quiz generation, summarization, and flashcards */
export const chatModel = metered(openai("gpt-4.1-mini"));

/** Lightweight model — used for quick structured extraction tasks */
export const fastModel = metered(openai("gpt-4.1-mini"));

/** Vision model — used for image, slide, and diagram extraction */
export const visionModel = metered(openai("gpt-4o"));
