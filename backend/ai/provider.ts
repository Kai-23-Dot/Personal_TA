/**
 * OpenAI provider for all AI model calls.
 *
 * Uses the Vercel AI SDK @ai-sdk/openai adapter with the standard OpenAI API.
 * Set OPENAI_API_KEY in your .env.local.
 *
 * All models are wrapped with cost-weighted credit middleware. Each call
 * reserves allowance before reaching the provider, then settles to the actual
 * input/output cost reported by the provider.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { wrapLanguageModel, type LanguageModelV1, type LanguageModelV1Middleware } from "ai";
import { getUsageUserId } from "@/backend/billing/usageContext";
import {
  AI_CREDIT_RESERVATION,
  recordUsage,
  reserveAiCredits,
  settleAiCreditReservation,
} from "@/backend/billing/limits";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

interface ModelRates {
  inputPerMillion: number;
  outputPerMillion: number;
}

/** One credit is $0.001; always round provider cost upward. */
export function aiCreditsForUsage(
  promptTokens: number,
  completionTokens: number,
  rates: ModelRates
): number {
  const credits =
    (Math.max(0, promptTokens) * rates.inputPerMillion +
      Math.max(0, completionTokens) * rates.outputPerMillion) /
    1_000;
  return Math.max(1, Math.ceil(credits));
}

function meteringMiddleware(rates: ModelRates): LanguageModelV1Middleware {
  return {
    async wrapGenerate({ doGenerate }) {
      const userId = getUsageUserId();
      if (!userId) return doGenerate();
      await reserveAiCredits(userId);
      try {
        const result = await doGenerate();
        const usage = result.usage;
        const promptTokens = usage?.promptTokens ?? 0;
        const completionTokens = usage?.completionTokens ?? 0;
        await Promise.all([
          settleAiCreditReservation(
            userId,
            AI_CREDIT_RESERVATION,
            aiCreditsForUsage(promptTokens, completionTokens, rates)
          ),
          recordUsage(userId, "tokens", promptTokens + completionTokens),
        ]);
        return result;
      } catch (error) {
        await settleAiCreditReservation(userId, AI_CREDIT_RESERVATION, 0);
        throw error;
      }
    },
    async wrapStream({ doStream }) {
      const userId = getUsageUserId();
      if (!userId) return doStream();
      await reserveAiCredits(userId);
      let result: Awaited<ReturnType<typeof doStream>>;
      try {
        result = await doStream();
      } catch (error) {
        await settleAiCreditReservation(userId, AI_CREDIT_RESERVATION, 0);
        throw error;
      }
      const { stream, ...rest } = result;
      let settled = false;
      const tap = new TransformStream({
        async transform(chunk, controller) {
          if (chunk.type === "finish") {
            const usage = chunk.usage;
            const promptTokens = usage?.promptTokens ?? 0;
            const completionTokens = usage?.completionTokens ?? 0;
            await Promise.all([
              settleAiCreditReservation(
                userId,
                AI_CREDIT_RESERVATION,
                aiCreditsForUsage(promptTokens, completionTokens, rates)
              ),
              recordUsage(userId, "tokens", promptTokens + completionTokens),
            ]);
            settled = true;
          }
          controller.enqueue(chunk);
        },
        async flush() {
          if (!settled) {
            await settleAiCreditReservation(userId, AI_CREDIT_RESERVATION, 0);
          }
        },
      });
      return { stream: stream.pipeThrough(tap), ...rest };
    },
  };
}

function metered(model: LanguageModelV1, rates: ModelRates): LanguageModelV1 {
  return wrapLanguageModel({ model, middleware: meteringMiddleware(rates) });
}

/** Primary model — used for chat, quiz generation, summarization, and flashcards */
export const chatModel = metered(openai("gpt-4.1-mini"), {
  inputPerMillion: 0.4,
  outputPerMillion: 1.6,
});

/** Lightweight model — used for quick structured extraction tasks */
export const fastModel = metered(openai("gpt-4.1-mini"), {
  inputPerMillion: 0.4,
  outputPerMillion: 1.6,
});

/** Vision model — used for image, slide, and diagram extraction */
export const visionModel = metered(openai("gpt-4o"), {
  inputPerMillion: 2.5,
  outputPerMillion: 10,
});
