import type { RankedSource } from "./types";

export interface EvalCase {
  id: string;
  label: string;
  relevantSourceIds: string[];
  retrieved: RankedSource[];
}

export interface EvalMetrics {
  precisionAt5: number;
  recallAt10: number;
  mrr: number;
  falsePositiveRate: number;
  confidenceAccuracy: number;
}

function precisionAtK(cases: EvalCase[], k: number): number {
  if (!cases.length) return 0;
  const values = cases.map((c) => {
    const top = c.retrieved.slice(0, k);
    if (!top.length) return 0;
    const tp = top.filter((r) => c.relevantSourceIds.includes(r.chunk.documentId)).length;
    return tp / top.length;
  });
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function recallAtK(cases: EvalCase[], k: number): number {
  if (!cases.length) return 0;
  const values = cases.map((c) => {
    const topIds = new Set(c.retrieved.slice(0, k).map((r) => r.chunk.documentId));
    const hits = c.relevantSourceIds.filter((id) => topIds.has(id)).length;
    return c.relevantSourceIds.length ? hits / c.relevantSourceIds.length : 0;
  });
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function mrr(cases: EvalCase[]): number {
  if (!cases.length) return 0;
  const rr = cases.map((c) => {
    const idx = c.retrieved.findIndex((r) => c.relevantSourceIds.includes(r.chunk.documentId));
    return idx === -1 ? 0 : 1 / (idx + 1);
  });
  return rr.reduce((a, b) => a + b, 0) / rr.length;
}

export function evaluateRetrieval(cases: EvalCase[]): EvalMetrics {
  const p5 = precisionAtK(cases, 5);
  const r10 = recallAtK(cases, 10);
  const mrrScore = mrr(cases);

  let fp = 0;
  let total = 0;
  let confCorrect = 0;
  for (const c of cases) {
    for (const r of c.retrieved.slice(0, 10)) {
      total += 1;
      const relevant = c.relevantSourceIds.includes(r.chunk.documentId);
      if (!relevant) fp += 1;
      if ((r.confidence >= 0.6) === relevant) confCorrect += 1;
    }
  }

  return {
    precisionAt5: p5,
    recallAt10: r10,
    mrr: mrrScore,
    falsePositiveRate: total ? fp / total : 0,
    confidenceAccuracy: total ? confCorrect / total : 0,
  };
}
