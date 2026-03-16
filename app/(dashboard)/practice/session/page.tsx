"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChat } from "ai/react";
import { CodeBlock } from "@/components/practice/CodeBlock";
import { OptionsList } from "@/components/practice/OptionsList";
import { FeedbackBox } from "@/components/practice/FeedbackBox";
import { HintBox } from "@/components/practice/HintBox";
import { NavigationControls } from "@/components/practice/NavigationControls";

type QuizQuestion = {
  question: string;
  type: "multiple_choice" | "true_false" | "short_answer";
  options?: string[];
  correct_answer: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
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
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!sessionId) {
        setError("Missing sessionId");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/practice/session?sessionId=${sessionId}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load session");
        }
        if (mounted) setSession(data);
      } catch (err) {
        if (mounted) setError((err as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [sessionId]);

  useEffect(() => {
    setShowHint(false);
  }, [index]);

  const questions = session?.questions ?? [];
  const current = questions[index];

  const progressLabel = useMemo(() => {
    if (!questions.length) return "";
    return `${index + 1} / ${questions.length}`;
  }, [index, questions.length]);

  const currentAnswer = answers[index] ?? null;
  const showFeedback = Boolean(currentAnswer);

  const parsedQuestion = useMemo(() => {
    if (!current) return { prompt: "", code: null };
    return extractCodeFromQuestion(current.question);
  }, [current]);

  const options = useMemo(() => {
    if (!current?.options) return [];
    return current.options.map((opt) => ({ value: opt, label: opt }));
  }, [current]);

  const chatContext = useMemo(() => {
    if (!current || !session) return "";
    return [
      `Topic: ${session.topic}`,
      `Difficulty: ${session.difficulty}`,
      `Question: ${current.question}`,
      parsedQuestion.code ? `Code:\n${parsedQuestion.code}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  }, [current, session, parsedQuestion.code]);

  const { messages, input, handleInputChange, handleSubmit, isLoading: chatLoading } = useChat({
    api: "/api/chat/context",
    body: {
      sessionId: sessionId ?? "practice",
      context: chatContext,
    },
  });

  function setAnswer(value: string) {
    setAnswers((prev) => ({ ...prev, [index]: value }));
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
        }),
      });

      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveNote() {
    if (!current || !session) return;
    const payload = {
      title: `Practice: ${session.topic} — Q${index + 1}`,
      content: `Question:\n${current.question}\n\nCorrect Answer:\n${current.correct_answer}\n\nExplanation:\n${current.explanation}`,
      courseId: session.course_id,
    };

    const res = await fetch("/api/notes/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      toast.error("Could not save note.");
      return;
    }

    toast.success("Saved to Notes");
  }

  if (loading) {
    return <section className="section"><p style={{ color: "var(--gray)" }}>Loading practice test...</p></section>;
  }

  if (error || !session) {
    return (
      <section className="section">
        <p style={{ color: "var(--gray)" }}>{error ?? "Session not found"}</p>
        <button className="btn btn-secondary" type="button" onClick={() => router.push("/practice")}>
          Back to Practice
        </button>
      </section>
    );
  }

  return (
    <section className="section">
      <header className="practice-header">
        <div>
          <h2 className="animate-on-scroll">Practice Test</h2>
          <p style={{ color: "var(--gray)" }}>Topic: {session.topic} · Difficulty: {session.difficulty}</p>
        </div>
        <div className="practice-progress" aria-label="Question progress">
          Question {index + 1} · {progressLabel}
        </div>
      </header>

      {current ? (
        <article className="practice-card" aria-labelledby="question-title">
          <h3 id="question-title" className="practice-question-title">Question {index + 1}</h3>
          <section className="practice-question">
            <div className="practice-prompt">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsedQuestion.prompt}</ReactMarkdown>
            </div>
            {parsedQuestion.code ? <CodeBlock code={parsedQuestion.code} /> : null}
          </section>

          {current.options && current.options.length > 0 ? (
            <OptionsList
              name={`question-${index}`}
              options={options}
              selected={currentAnswer}
              correctAnswer={current.correct_answer}
              showFeedback={showFeedback}
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

          <div className="practice-actions">
            <button className="btn btn-secondary" type="button" onClick={() => setShowHint((v) => !v)}>
              {showHint ? "Hide Hint" : "Show Hint"}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setChatOpen(true)}>
              Ask PersonalTA
            </button>
            <button className="btn btn-secondary" type="button" onClick={handleSaveNote}>
              Save as Note
            </button>
          </div>

          <HintBox explanation={current.explanation} show={showHint} />
          {showFeedback ? (
            <FeedbackBox
              selected={currentAnswer}
              correctAnswer={current.correct_answer}
              explanation={current.explanation}
            />
          ) : null}

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

      {chatOpen ? (
        <aside className="practice-chat" aria-label="Ask PersonalTA">
          <div className="practice-chat__header">
            <strong>Ask PersonalTA</strong>
            <button type="button" className="btn btn-secondary" onClick={() => setChatOpen(false)}>
              Close
            </button>
          </div>
          <div className="practice-chat__body">
            {messages.length === 0 ? (
              <p style={{ color: "var(--gray)" }}>Ask about this question or concept.</p>
            ) : null}
            {messages.map((msg) => (
              <div key={msg.id} className={`practice-chat__message practice-chat__message--${msg.role}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}
                </ReactMarkdown>
              </div>
            ))}
          </div>
          <form className="practice-chat__form" onSubmit={handleSubmit}>
            <textarea
              rows={3}
              placeholder="Why does this output appear in this order?"
              value={input}
              onChange={handleInputChange}
            />
            <button type="submit" className="btn btn-primary" disabled={chatLoading}>
              {chatLoading ? "Sending..." : "Send"}
            </button>
          </form>
        </aside>
      ) : null}
    </section>
  );
}
