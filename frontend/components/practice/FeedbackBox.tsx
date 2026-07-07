"use client";

import { cn } from "@/backend/utils";

type FeedbackBoxProps = {
  selected: string | null;
  correctAnswer: string;
  explanation: string;
};

export function FeedbackBox({ selected, correctAnswer, explanation }: FeedbackBoxProps) {
  if (!selected) return null;

  const isCorrect = selected.trim().toLowerCase() === correctAnswer.trim().toLowerCase();

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mt-4 space-y-1.5 rounded-xl border px-4 py-3.5",
        isCorrect ? "border-emerald-400/30 bg-emerald-500/8" : "border-rose-400/30 bg-rose-500/8"
      )}
    >
      <div className={cn("text-sm font-semibold", isCorrect ? "text-emerald-300" : "text-rose-300")}>
        {isCorrect ? "Correct!" : "Not quite."}
      </div>
      <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Solution</div>
      <div className="text-sm text-foreground">
        <strong className="font-semibold">Correct answer:</strong> {correctAnswer}
      </div>
      <div className="text-sm text-muted-foreground">{explanation}</div>
    </div>
  );
}
