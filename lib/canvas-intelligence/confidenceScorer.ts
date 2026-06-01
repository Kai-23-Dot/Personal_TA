import type { ConfidenceResult, RankedSource } from "./types";

export function scoreConfidence(results: RankedSource[]): ConfidenceResult {
  if (results.length === 0) {
    return {
      overall: 0,
      level: "low",
      shouldAskForClarification: true,
      explanation: "No relevant sources found.",
    };
  }

  const top = results.slice(0, 5);
  const avg = top.reduce((sum, r) => sum + r.confidence, 0) / top.length;
  const spread = top[0].score - (top[1]?.score ?? 0);
  const overall = Math.max(0, Math.min(1, avg * 0.8 + Math.min(0.2, spread)));

  if (overall >= 0.75) return { overall, level: "high", shouldAskForClarification: false, explanation: "Top sources strongly match topic and context." };
  if (overall >= 0.5) return { overall, level: "medium", shouldAskForClarification: false, explanation: "Sources are plausible but mixed; include citations." };
  return { overall, level: "low", shouldAskForClarification: true, explanation: "Low confidence; expand search or ask user to select candidate materials." };
}
