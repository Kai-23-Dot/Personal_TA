"use client";

import { useMemo } from "react";

type HintBoxProps = {
  explanation: string;
  show: boolean;
};

function buildHints(explanation: string) {
  const sentences = explanation
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length >= 3) return sentences.slice(0, 3);
  if (sentences.length === 2) return sentences;
  if (sentences.length === 1) return [sentences[0], "Look for the key concept that determines the correct choice."];
  return [
    "Identify the key concept in the question.",
    "Eliminate options that contradict the definition.",
    "Check which choice matches the course notes.",
  ];
}

export function HintBox({ explanation, show }: HintBoxProps) {
  const hints = useMemo(() => buildHints(explanation), [explanation]);
  if (!show) return null;

  return (
    <div className="hint-box" role="note">
      <div className="hint-title">Hint</div>
      <ol>
        {hints.map((hint) => (
          <li key={hint}>{hint}</li>
        ))}
      </ol>
    </div>
  );
}
