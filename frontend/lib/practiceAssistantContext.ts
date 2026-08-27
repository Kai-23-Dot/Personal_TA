import { normalizeAssistantContextText } from "./assistantScreenContext";

type PracticeContextQuestion = {
  question: string;
  options?: string[];
  correct_answer: string;
  explanation: string;
};

type PracticeContextSession = {
  topic: string;
  difficulty: string;
};

type BuildPracticeContextInput = {
  session: PracticeContextSession | null;
  questions: PracticeContextQuestion[];
  answers: Record<number, string>;
  currentIndex: number;
  submitted: boolean;
};

const PRACTICE_CONTEXT_LIMIT = 6_200;

function cleanField(value: string, maxChars: number): string {
  return normalizeAssistantContextText(value, maxChars) || "(not provided)";
}

function answersMatch(correctAnswer: string, studentAnswer: string): boolean {
  return correctAnswer.trim().toLowerCase() === studentAnswer.trim().toLowerCase();
}

/** Build a truthful, bounded practice snapshot without revealing answers mid-test. */
export function buildPracticeAssistantContext({
  session,
  questions,
  answers,
  currentIndex,
  submitted,
}: BuildPracticeContextInput): string {
  if (!session || questions.length === 0) return "";

  if (!submitted) {
    const current = questions[currentIndex];
    if (!current) return "";
    const lines = [
      "Practice state: active assessment (not submitted)",
      `Topic: ${cleanField(session.topic, 240)}`,
      `Difficulty: ${cleanField(session.difficulty, 80)}`,
      `Question ${currentIndex + 1} of ${questions.length}: ${cleanField(current.question, 1_200)}`,
    ];
    if (current.options?.length) {
      lines.push("Answer choices:");
      current.options.forEach((option, optionIndex) => {
        lines.push(`${String.fromCharCode(65 + optionIndex)}. ${cleanField(option, 400)}`);
      });
    } else {
      lines.push("Response type: short answer");
    }
    lines.push(`Student's current answer: ${cleanField(answers[currentIndex] ?? "(no answer yet)", 700)}`);
    lines.push("Academic-integrity mode: provide guidance or hints, not the final answer.");
    return normalizeAssistantContextText(lines.join("\n"), PRACTICE_CONTEXT_LIMIT);
  }

  const resultRows = questions.map((question, questionIndex) => {
    const studentAnswer = answers[questionIndex] ?? "";
    return {
      question,
      questionIndex,
      studentAnswer,
      correct: answersMatch(question.correct_answer, studentAnswer),
    };
  });
  const correctCount = resultRows.filter((result) => result.correct).length;
  const percent = Math.round((correctCount / questions.length) * 100);
  const incorrectNumbers = resultRows
    .filter((result) => !result.correct)
    .map((result) => result.questionIndex + 1);

  const lines = [
    "Practice state: submitted results (review mode)",
    `Topic: ${cleanField(session.topic, 240)}`,
    `Difficulty: ${cleanField(session.difficulty, 80)}`,
    `Verified score: ${correctCount} of ${questions.length} (${percent}% correct)`,
    correctCount === questions.length
      ? "Overall verification: Every question is correct."
      : "Overall verification: Not every question is correct.",
    `Incorrect question numbers: ${incorrectNumbers.length ? incorrectNumbers.join(", ") : "None"}`,
    "Question-by-question results:",
  ];

  for (const result of resultRows) {
    lines.push(
      `Question ${result.questionIndex + 1} — ${result.correct ? "CORRECT" : "INCORRECT"}`,
      `Prompt: ${cleanField(result.question.question, 700)}`,
      `Student answer: ${cleanField(result.studentAnswer || "(no answer)", 400)}`,
      `Correct answer: ${cleanField(result.question.correct_answer, 400)}`,
      `Explanation: ${cleanField(result.question.explanation, 650)}`
    );
  }

  return normalizeAssistantContextText(lines.join("\n"), PRACTICE_CONTEXT_LIMIT);
}
