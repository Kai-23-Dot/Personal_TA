"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function resumeKey(sid: string) {
  return `practice_resume_${sid}`;
}
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/frontend/components/practice/CodeBlock";
import { OptionsList } from "@/frontend/components/practice/OptionsList";
import { FeedbackBox } from "@/frontend/components/practice/FeedbackBox";
import { NavigationControls } from "@/frontend/components/practice/NavigationControls";
import { useSetPageContent } from "@/frontend/contexts/page-context";

type QuizQuestion = {
  question: string;
  type: "multiple_choice" | "true_false" | "short_answer";
  options?: string[];
  correct_answer: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  source_title?: string | null;
  source_module?: string | null;
  source_url?: string | null;
};

type PracticeSession = {
  id: string;
  topic: string;
  difficulty: string;
  question_count: number;
  questions: QuizQuestion[];
  course_id: string | null;
  status: string;
};

function extractCodeFromQuestion(question: string) {
  const match = question.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
  if (!match) return { prompt: question, code: null };
  const code = match[1].trim();
  const prompt = question.replace(match[0], "").trim();
  return { prompt, code };
}

export default function PracticeSessionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");

  const [session, setSession] = useState<PracticeSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [times, setTimes] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const sessionStartRef = useRef<number | null>(null);
  const questionStartRef = useRef<number | null>(null);
  const sessionRef = useRef<PracticeSession | null>(null);

  // Auto-save progress to localStorage whenever answers or index change
  useEffect(() => {
    if (!sessionId || !sessionRef.current || submitted) return;
    try {
      localStorage.setItem(resumeKey(sessionId), JSON.stringify({
        answers,
        index,
        topic: sessionRef.current.topic,
        total: sessionRef.current.question_count,
        savedAt: new Date().toISOString(),
      }));
    } catch {
      // ignore storage errors
    }
  }, [answers, index, sessionId, submitted]);

  const loadSession = useCallback(async () => {
    if (!sessionId) {
      setError("Missing sessionId");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/practice/session?sessionId=${sessionId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load session");
      }
      sessionRef.current = data;
      setSession(data);
      // Restore saved progress (no extra API calls / tokens)
      try {
        const saved = localStorage.getItem(resumeKey(sessionId));
        if (saved) {
          const { answers: savedAnswers, index: savedIndex } = JSON.parse(saved);
          if (savedAnswers && typeof savedAnswers === "object") setAnswers(savedAnswers);
          if (typeof savedIndex === "number") setIndex(savedIndex);
        }
      } catch {
        // ignore — start fresh if parsing fails
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    let mounted = true;
    if (!mounted) return;
    loadSession();
    return () => {
      mounted = false;
    };
  }, [loadSession]);

  useEffect(() => {
    questionStartRef.current = Date.now();
  }, [index]);

  useEffect(() => {
    if (!sessionStartRef.current) sessionStartRef.current = Date.now();
  }, []);

  const questions = session?.questions ?? [];
  const current = questions[index];

  const progressLabel = useMemo(() => {
    if (!questions.length) return "";
    return `${index + 1} / ${questions.length}`;
  }, [index, questions.length]);

  const currentAnswer = answers[index] ?? null;

  const parsedQuestion = useMemo(() => {
    if (!current) return { prompt: "", code: null };
    return extractCodeFromQuestion(current.question);
  }, [current]);

  const options = useMemo(() => {
    if (!current?.options) return [];
    return current.options.map((opt) => ({ value: opt, label: opt }));
  }, [current]);

  // Push visible screen content so the AI Assistant can see the current question
  const screenContent = useMemo(() => {
    if (!session || !current || submitted) return "";
    const lines = [
      `Practice Test — Topic: ${session.topic} | Difficulty: ${session.difficulty}`,
      `Question ${index + 1} of ${questions.length}:`,
      current.question,
    ];
    if (current.options && current.options.length > 0) {
      lines.push("Answer choices:");
      current.options.forEach((opt, i) => lines.push(`  ${String.fromCharCode(65 + i)}. ${opt}`));
    } else {
      lines.push("(Short answer question)");
    }
    if (answers[index]) lines.push(`Student's current answer: ${answers[index]}`);
    return lines.join("\n");
  }, [session, current, index, questions.length, answers, submitted]);

  useSetPageContent(screenContent);

  function setAnswer(value: string) {
    setAnswers((prev) => ({ ...prev, [index]: value }));
    if (questionStartRef.current) {
      const elapsed = Math.max(1, Math.round((Date.now() - questionStartRef.current) / 1000));
      setTimes((prev) => ({ ...prev, [index]: prev[index] ?? elapsed }));
    }
  }

  async function handleSubmitTest() {
    if (!session || !sessionId) return;
    setSubmitting(true);
    try {
      const total = questions.length;
      const correct = questions.reduce((count, question, idx) => {
        const userAnswer = answers[idx];
        if (!userAnswer) return count;
        return question.correct_answer.trim().toLowerCase() === userAnswer.trim().toLowerCase()
          ? count + 1
          : count;
      }, 0);

      await fetch("/api/practice/generate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          correct,
          total,
          topic: session.topic,
          courseId: session.course_id,
          durationSeconds: sessionStartRef.current ? Math.round((Date.now() - sessionStartRef.current) / 1000) : null,
          attempts: questions.map((q, idx) => ({
            question_index: idx,
            user_answer: answers[idx] ?? "",
            is_correct: q.correct_answer.trim().toLowerCase() === (answers[idx] ?? "").trim().toLowerCase(),
            time_taken_seconds: times[idx] ?? 0,
          })),
        }),
      });

      setSubmitted(true);
      // Clear saved progress — test is done
      if (sessionId) {
        try { localStorage.removeItem(resumeKey(sessionId)); } catch {}
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <section className="section"><p style={{ color: "var(--gray)" }}>Loading practice test...</p></section>;
  }

  if (error || !session) {
    return (
      <section className="section">
        <p style={{ color: "var(--gray)" }}>{error ?? "Session not found"}</p>
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
          <button className="btn btn-secondary" type="button" onClick={loadSession}>
            Retry
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => router.push("/practice")}>
            Back to practice
          </button>
        </div>
      </section>
    );
  }

  const score = questions.reduce(
    (count, q, idx) =>
      q.correct_answer.trim().toLowerCase() === (answers[idx] ?? "").trim().toLowerCase()
        ? count + 1
        : count,
    0
  );
  const totalMinutes = sessionStartRef.current
    ? Math.round((Date.now() - sessionStartRef.current) / 60_000)
    : 0;
  const scorePct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

  if (submitted) {
    const scoreColor =
      scorePct >= 80 ? "#7dd3fc" : scorePct >= 60 ? "#fbbf24" : "#fda4af";

    return (
      <section className="section">
        <header className="practice-header">
          <div>
            <h2>Test Results</h2>
            <p style={{ color: "var(--gray)" }}>
              Topic: {session.topic} · Difficulty: {session.difficulty}
            </p>
          </div>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => router.push("/practice")}
          >
            Back to practice
          </button>
        </header>

        <div
          className="practice-card"
          style={{ marginBottom: "1.5rem", textAlign: "center", padding: "2rem" }}
        >
          <p
            style={{
              fontSize: "3.5rem",
              fontWeight: "700",
              color: scoreColor,
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}
          >
            {score} / {questions.length}
          </p>
          <p style={{ color: "var(--gray)", marginTop: "0.6rem", fontSize: "1rem" }}>
            {scorePct}% correct · {totalMinutes} min
          </p>
        </div>

        <div style={{ display: "grid", gap: "1rem" }}>
          {questions.map((q, idx) => {
            const userAnswer = answers[idx] ?? "";
            const isCorrect =
              q.correct_answer.trim().toLowerCase() === userAnswer.trim().toLowerCase();
            const parsedQ = extractCodeFromQuestion(q.question);
            return (
              <article
                key={idx}
                className="practice-card"
                style={{
                  borderLeft: `3px solid ${isCorrect ? "#7dd3fc" : "#fda4af"}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  <span
                    style={{
                      fontSize: "1.1rem",
                      color: isCorrect ? "#7dd3fc" : "#fda4af",
                      fontWeight: "700",
                    }}
                  >
                    {isCorrect ? "✓" : "✗"}
                  </span>
                  <h4
                    style={{
                      margin: 0,
                      color: "var(--light)",
                      fontSize: "0.85rem",
                      fontWeight: "600",
                    }}
                  >
                    Question {idx + 1}
                  </h4>
                </div>
                <div className="practice-prompt" style={{ marginBottom: "0.75rem" }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsedQ.prompt}</ReactMarkdown>
                </div>
                {parsedQ.code ? <CodeBlock code={parsedQ.code} /> : null}
                {q.source_title && (
                  <div style={{ marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--gray)", opacity: 0.75 }}>From:</span>
                    {q.source_url ? (
                      <a
                        href={q.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "0.72rem", color: "#7dd3fc", textDecoration: "none", borderBottom: "1px dotted #7dd3fc44" }}
                      >
                        {q.source_title}{q.source_module ? ` · ${q.source_module}` : ""}
                      </a>
                    ) : (
                      <span style={{ fontSize: "0.72rem", color: "var(--gray)" }}>
                        {q.source_title}{q.source_module ? ` · ${q.source_module}` : ""}
                      </span>
                    )}
                  </div>
                )}
                <FeedbackBox
                  selected={userAnswer || "(no answer)"}
                  correctAnswer={q.correct_answer}
                  explanation={q.explanation}
                />
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <header className="practice-header">
        <div>
          <h2 className="animate-on-scroll">Practice Test</h2>
          <p style={{ color: "var(--gray)" }}>
            Topic: {session.topic} · Difficulty: {session.difficulty}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div className="practice-progress" aria-label="Question progress">
            Question {index + 1} · {progressLabel}
          </div>
          <button
            className="btn btn-secondary"
            type="button"
            style={{ fontSize: "0.8rem", padding: "0.4rem 0.9rem" }}
            onClick={() => router.push("/practice")}
          >
            Exit & resume later
          </button>
        </div>
      </header>

      {current ? (
        <article className="practice-card" aria-labelledby="question-title">
          <h3 id="question-title" className="practice-question-title">
            Question {index + 1}
          </h3>
          <section className="practice-question">
            <div className="practice-prompt">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsedQuestion.prompt}</ReactMarkdown>
            </div>
            {parsedQuestion.code ? <CodeBlock code={parsedQuestion.code} /> : null}
          </section>

          {current.source_title && (
            <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--gray)", opacity: 0.75 }}>From:</span>
              {current.source_url ? (
                <a
                  href={current.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "0.72rem", color: "#7dd3fc", textDecoration: "none", borderBottom: "1px dotted #7dd3fc44" }}
                >
                  {current.source_title}{current.source_module ? ` · ${current.source_module}` : ""}
                </a>
              ) : (
                <span style={{ fontSize: "0.72rem", color: "var(--gray)" }}>
                  {current.source_title}{current.source_module ? ` · ${current.source_module}` : ""}
                </span>
              )}
            </div>
          )}

          {current.options && current.options.length > 0 ? (
            <OptionsList
              name={`question-${index}`}
              options={options}
              selected={currentAnswer}
              correctAnswer={current.correct_answer}
              showFeedback={false}
              onSelect={setAnswer}
            />
          ) : (
            <div className="form-field" style={{ marginTop: "1.5rem" }}>
              <label htmlFor="shortAnswer">Your answer</label>
              <textarea
                id="shortAnswer"
                rows={4}
                value={currentAnswer ?? ""}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </div>
          )}

          <NavigationControls
            onPrev={() => setIndex((i) => Math.max(i - 1, 0))}
            onNext={() => setIndex((i) => Math.min(i + 1, questions.length - 1))}
            onSubmit={handleSubmitTest}
            isFirst={index === 0}
            isLast={index === questions.length - 1}
            submitting={submitting}
          />
        </article>
      ) : null}
    </section>
  );
}
