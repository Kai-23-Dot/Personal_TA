/**
 * Note summarization using Vercel AI SDK + Anthropic Claude.
 * Uses generateText (not the raw Anthropic SDK) for consistency.
 */
import { generateText } from "ai";
import { chatModel, fastModel } from "./provider";
import type { SummaryType } from "@/types";

export interface SummarizeOptions {
  content: string;
  title: string;
  summaryType: SummaryType;
  customInstruction?: string;
  courseName?: string;
  maxTokens?: number;
}

export interface SummarizeResult {
  summary: string;
  keyConcepts: string[];
  tokensUsed: number;
}

function sanitizeSummaryOutput(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

const SYSTEM_PROMPTS: Record<SummaryType, string> = {
  bullet_points: `You are an expert study assistant. Summarize the given notes into clear, actionable bullet points.
Format:
## Key Points
- [Most important concept]
- [Second concept]
... (5-10 bullets max)

## Quick Review
2-3 sentence overview

Keep language simple, student-friendly. Focus on what's testable.`,

  outline: `You are an expert study assistant. Create a structured outline of the given notes.
Format using markdown headers and nested bullets:
## [Main Topic 1]
### [Subtopic]
- Detail
- Detail
## [Main Topic 2]
...

Be hierarchical and organized. Suitable for an outline/index card.`,

  detailed: `You are an expert study assistant. Create a comprehensive, detailed summary of the given notes.
Include:
## Summary
[Thorough paragraph summary]

## Key Concepts
[Numbered list with brief explanations]

## Important Details
[Any formulas, dates, names, or specific facts]

## Connections
[How concepts relate to each other]

Be thorough but clear. Use the student's language level.`,

  unit_aggregate: `You are an expert study assistant. Synthesize multiple notes from a unit into one unified study guide.
If a special instruction specifies a style (bullet points, outline, detailed), follow it while keeping the core structure.
Format:
## Unit Overview
[Big-picture summary]

## Core Themes
[Major themes that span the notes]

## Topic Breakdown
[Each major topic with key points]

## Study Checklist
- [ ] [Topic to master]
...

Highlight connections, recurring themes, and likely test topics.`,
};

export async function summarizeNotes(options: SummarizeOptions): Promise<SummarizeResult> {
  const { content, title, summaryType, customInstruction, courseName, maxTokens = 4096 } = options;

  const userMessage = [
    courseName ? `Course: ${courseName}` : null,
    `Note title: ${title}`,
    customInstruction ? `Special instruction: ${customInstruction}` : null,
    "",
    "=== NOTE CONTENT ===",
    content.slice(0, 30000),
  ]
    .filter(Boolean)
    .join("\n");

  // Generate main summary
  const { text: summaryText, usage: summaryUsage, finishReason } = await generateText({
    model: chatModel,
    system: `${SYSTEM_PROMPTS[summaryType]}\n\nDo not output internal reasoning, chain-of-thought, or <think> tags. Output only the final study guide content.`,
    prompt: userMessage,
    maxTokens,
  });

  let finalSummaryText = summaryText;
  let finalSummaryUsage = summaryUsage;

  if (finishReason === "length") {
    const continuation = await generateText({
      model: chatModel,
      system: `${SYSTEM_PROMPTS[summaryType]}\n\nContinue the study guide from exactly where the previous response stopped. Do not restart, summarize, apologize, or include internal reasoning. Finish any incomplete section and include the Study Checklist if it has not appeared yet.`,
      prompt: [
        userMessage,
        "",
        "=== PARTIAL STUDY GUIDE TO CONTINUE ===",
        summaryText,
      ].join("\n"),
      maxTokens: Math.min(maxTokens, 4096),
    });
    finalSummaryText = `${summaryText.trim()}\n${continuation.text.trim()}`;
    finalSummaryUsage = {
      promptTokens: summaryUsage.promptTokens + continuation.usage.promptTokens,
      completionTokens: summaryUsage.completionTokens + continuation.usage.completionTokens,
      totalTokens: summaryUsage.totalTokens + continuation.usage.totalTokens,
    };
  }

  // Extract key concepts
  const { text: conceptsText, usage: conceptsUsage } = await generateText({
    model: fastModel,
    system:
      "Extract the 5-8 most important key concepts or terms from this text. Return ONLY a JSON array of strings, nothing else. Example: [\"Mitosis\",\"DNA replication\"]",
    prompt: content.slice(0, 8000),
    maxTokens: 256,
  });

  let keyConcepts: string[] = [];
  try {
    const start = conceptsText.indexOf("[");
    const end = conceptsText.lastIndexOf("]");
    if (start !== -1 && end !== -1 && end > start) {
      keyConcepts = JSON.parse(conceptsText.slice(start, end + 1));
    }
  } catch {
    keyConcepts = [];
  }

  const tokensUsed =
    (finalSummaryUsage.promptTokens + finalSummaryUsage.completionTokens) +
    (conceptsUsage.promptTokens + conceptsUsage.completionTokens);

  return { summary: sanitizeSummaryOutput(finalSummaryText), keyConcepts, tokensUsed };
}
