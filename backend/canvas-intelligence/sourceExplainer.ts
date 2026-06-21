import type { RankedSource } from "./types";

export function explainSourceChoice(source: RankedSource): string {
  const reasons: string[] = [];
  if (source.signals.semanticSimilarity > 0.65) reasons.push("high semantic similarity");
  if (source.signals.keywordMatch > 0.5) reasons.push("strong keyword overlap");
  if (source.signals.titleMatch > 0.5) reasons.push("title aligns with query");
  if (source.signals.moduleProximity > 0.6) reasons.push("module/date proximity");
  if (source.signals.dateProximity > 0.7) reasons.push("close to assessment date");
  if (source.signals.linkedFromModuleScore > 0.7) reasons.push("linked from module context");
  if (source.signals.contentTypePriority > 0.85) reasons.push("high-value study material type");
  return reasons.join(", ") || "best available match";
}
