"use client";

type FeedbackBoxProps = {
  selected: string | null;
  correctAnswer: string;
  explanation: string;
};

export function FeedbackBox({ selected, correctAnswer, explanation }: FeedbackBoxProps) {
  if (!selected) return null;

  const isCorrect = selected.trim().toLowerCase() === correctAnswer.trim().toLowerCase();

  return (
    <div className={`feedback-box ${isCorrect ? "feedback-box--correct" : "feedback-box--wrong"}`} role="status" aria-live="polite">
      <div className="feedback-status">
        {isCorrect ? "Correct!" : "Not quite."}
      </div>
      <div className="feedback-title">Solution</div>
      <div className="feedback-solution">
        <strong>Correct answer:</strong> {correctAnswer}
      </div>
      <div className="feedback-explanation">{explanation}</div>
    </div>
  );
}
