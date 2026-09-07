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
        isCorrect ? "border-[var(--success-ink)] bg-[var(--success-bg)]" : "border-[var(--danger-ink)] bg-[var(--danger-bg)]"
      )}
    >
      <div className={cn("text-sm font-semibold", isCorrect ? "text-[var(--success-ink)]" : "text-[var(--danger-ink)]")}>
        {isCorrect ? "Correct!" : "Not quite."}
      </div>
      <div className="text-xs font-medium text-muted-foreground">Solution</div>
      <div className="text-sm text-foreground">
        <strong className="font-semibold">Correct answer:</strong> {correctAnswer}
      </div>
      <div className="text-sm text-muted-foreground">{explanation}</div>
    </div>
  );
}
