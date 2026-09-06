"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Brain, CheckCircle2, Flame, Loader2,
  Sparkles, Target, X,
} from "lucide-react";
import { PageHero } from "@/frontend/components/ui/page-hero";

// ── Types ────────────────────────────────────────────────────────────────────

type WeakTopic = { topic: string; accuracy_pct: number };
type TrendPoint = { day: string; accuracy: number };
type Course = { id: string; name: string };

type Flashcard = {
  id: string;
  front: string;
  back: string;
  tags: string[];
  course_id: string | null;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
};

type ReadinessResult = {
  score: number;
  label: string;
  confidence: "high" | "medium" | "low";
  daysLeft: number;
  weakTopics: { topic: string; accuracy: number }[];
  dueFlashcards: number;
  breakdown: { accuracyScore: number; timeScore: number; weakScore: number; flashScore: number };
};

type UpcomingExam = { id: string; title: string; course_id: string; assignment_type: string };

// ── Flashcard review component ───────────────────────────────────────────────

function FlashcardReview({ cards, onDone }: { cards: Flashcard[]; onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [grading, setGrading] = useState(false);
  const [done, setDone] = useState(false);
  const [results, setResults] = useState<{ grade: number }[]>([]);

  const card = cards[idx];

  async function grade(g: number) {
    if (grading) return;
    setGrading(true);
    await fetch("/api/flashcards/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flashcardId: card.id, grade: g }),
    });
    setResults((prev) => [...prev, { grade: g }]);
    setGrading(false);
    if (idx + 1 >= cards.length) {
      setDone(true);
    } else {
      setIdx(idx + 1);
      setFlipped(false);
    }
  }

  if (done) {
    const correct = results.filter((r) => r.grade >= 3).length;
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--success-ink)] text-[var(--ink-faint)]">
          <CheckCircle2 className="h-7 w-7 text-[var(--success-ink)]" />
        </div>
        <p className="text-lg font-semibold text-[var(--ink)]">Session complete!</p>
        <p className="text-sm text-[var(--ink-muted)]">
          {correct} of {cards.length} cards recalled correctly
        </p>
        <button
          onClick={onDone}
          className="mt-2 rounded-xl border border-[var(--rule)] bg-[var(--paper)] px-4 py-2 text-sm text-[var(--ink-muted)] hover:bg-[var(--wash-hover)] hover:text-[var(--ink)]"
        >
          Back to review
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-[var(--ink-muted)]">
        <span>{idx + 1} of {cards.length}</span>
        <div className="flex gap-1">
          {cards.map((_, i) => (
            <div key={i} className={`h-1.5 w-5 rounded-full ${i < idx ? "bg-[var(--success-bg)]" : i === idx ? "bg-[var(--blue)]" : "bg-[var(--paper)]"}`} />
          ))}
        </div>
      </div>

      {/* Card */}
      <div
        className="cursor-pointer rounded-2xl border border-[var(--rule)] bg-[var(--paper)] p-8 text-center shadow-none transition hover:border-[var(--blue-edge)] min-h-[160px] flex flex-col items-center justify-center gap-4"
        onClick={() => setFlipped(!flipped)}
      >
        {!flipped ? (
          <>
            <p className="text-lg font-medium text-[var(--ink)] leading-relaxed">{card.front}</p>
            <p className="text-xs text-[var(--ink-muted)]">Tap to reveal answer</p>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold text-[var(--blue)]">Answer</p>
            <p className="text-base text-[var(--ink)] leading-relaxed">{card.back}</p>
          </>
        )}
      </div>

      {/* Grade buttons */}
      {flipped && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { g: 0, label: "Forgot", color: "border-[var(--danger-ink)] bg-[var(--danger-bg)] text-[#6e3630] hover:bg-[var(--danger-bg)]" },
            { g: 2, label: "Hard",   color: "border-[var(--warning-ink)] bg-[var(--warning-bg)] text-[#533b1b] hover:bg-[var(--warning-bg)]" },
            { g: 3, label: "Good",   color: "border-[var(--warning-ink)] bg-[var(--warning-bg)] text-[#533b1b] hover:bg-[var(--warning-bg)]" },
            { g: 5, label: "Easy",   color: "border-[var(--success-ink)] bg-[var(--success-bg)] text-[#1c3829] hover:bg-[var(--success-bg)]" },
          ].map(({ g, label, color }) => (
            <button
              key={g}
              onClick={() => grade(g)}
              disabled={grading}
              className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition disabled:opacity-50 ${color}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {!flipped && (
        <button
          onClick={() => setFlipped(true)}
          className="w-full rounded-xl border border-[var(--rule)] bg-[var(--blue-wash)] py-2.5 text-sm font-medium text-[var(--blue)] transition hover:bg-[var(--blue-wash)]"
        >
          Show answer
        </button>
      )}
    </div>
  );
}

// ── Readiness badge ──────────────────────────────────────────────────────────

function ReadinessBadge({ score, label }: { score: number; label: string }) {
  const color =
    score >= 80 ? "text-[var(--success-ink)] border-[var(--success-ink)] bg-[var(--success-bg)]" :
    score >= 60 ? "text-[var(--blue)] border-[var(--rule)] bg-[var(--blue-wash)]" :
    score >= 40 ? "text-[#533b1b] border-[var(--warning-ink)] bg-[var(--warning-bg)]" :
    "text-[var(--danger-ink)] border-[var(--danger-ink)] bg-[var(--danger-bg)]";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${color}`}>
      <span>{score}%</span>
      <span className="font-normal opacity-80">{label}</span>
    </span>
  );
}

// ── Section card ─────────────────────────────────────────────────────────────

function SectionCard({ title, subtitle, children, className = "" }: {
  title: string; subtitle?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-[var(--rule)] bg-[var(--paper)] p-5 shadow-none backdrop-blur ${className}`}>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-[var(--ink)]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

/* How far below the line a topic sits is the whole point of this list, so the
   bar carries it in colour as well as length — the percentage is also printed
   beside each bar, so colour is never the only signal. */
function masteryFill(accuracyPct: number): string {
  if (accuracyPct < 60) return "bg-[var(--danger-ink)]";
  if (accuracyPct < 80) return "bg-[var(--warning-ink)]";
  return "bg-[var(--success-ink)]";
}

export default function ReviewPage() {
  const router = useRouter();
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [upcomingExams, setUpcomingExams] = useState<UpcomingExam[]>([]);
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [readiness, setReadiness] = useState<Record<string, ReadinessResult>>({});
  const [loading, setLoading] = useState(true);
  const [courseId, setCourseId] = useState("");

  // Flashcard review session
  const [reviewCards, setReviewCards] = useState<Flashcard[] | null>(null);

  // Generating practice
  const [generating, setGenerating] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let exams: UpcomingExam[] = [];
    try {
      const [weakRes, trendRes, coursesRes, examsRes, cardsRes] = await Promise.all([
        fetch("/api/performance/weak"),
        fetch("/api/performance/trends"),
        fetch("/api/courses"),
        fetch("/api/assignments"),
        fetch("/api/flashcards/list?dueOnly=true"),
      ]);
      const weakData    = weakRes.ok    ? await weakRes.json()    : [];
      const trendData   = trendRes.ok   ? await trendRes.json()   : [];
      const coursesData = coursesRes.ok ? await coursesRes.json() : [];
      const examsData   = examsRes.ok   ? await examsRes.json()   : [];
      const cardsData   = cardsRes.ok   ? await cardsRes.json()   : [];

      setWeakTopics(weakData ?? []);
      setTrends(trendData ?? []);
      setCourses(coursesData ?? []);
      exams = (examsData ?? []).filter((a: UpcomingExam) =>
        ["exam", "test", "quiz"].includes(a.assignment_type)
      );
      setUpcomingExams(exams);
      setDueCards(cardsData ?? []);
      if ((coursesData?.length ?? 0) > 0) {
        setCourseId((currentCourseId) => currentCourseId || coursesData[0].id);
      }
    } catch {
      // Leave lists empty and fall through to the empty state instead of hanging on the skeleton.
    } finally {
      setLoading(false);
    }

    // Fetch readiness for each upcoming exam (first 3)
    exams.slice(0, 3).forEach(async (exam: UpcomingExam) => {
      try {
        const r = await fetch(`/api/performance/readiness?assignmentId=${exam.id}`);
        if (r.ok) {
          const data = await r.json() as ReadinessResult;
          setReadiness((prev) => ({ ...prev, [exam.id]: data }));
        }
      } catch {
        // Non-critical secondary fetch — ignore failures.
      }
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function launchReview(topic: string, selectedCourseId: string, questionCount: number) {
    setActionMessage(null);
    setGenerating(true);
    const res = await fetch("/api/practice/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, courseId: selectedCourseId, difficulty: "adaptive", questionCount }),
    });
    const data = await res.json();
    setGenerating(false);
    if (res.ok && data?.sessionId) { router.push(`/practice/session?sessionId=${data.sessionId}`); return; }
    if (res.status === 409) {
      setActionMessage("Low retrieval confidence for this topic. Open Notes, select relevant course materials, then generate practice again.");
      return;
    }
    setActionMessage(data?.error || "Could not generate review session.");
  }

  // If in flashcard review mode, show the reviewer
  if (reviewCards) {
    return (
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-medium text-[var(--ink-muted)]">
            Flashcard review — {reviewCards.length} due card{reviewCards.length === 1 ? "" : "s"}
          </p>
          <button
            onClick={() => { setReviewCards(null); load(); }}
            className="text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <FlashcardReview cards={reviewCards} onDone={() => { setReviewCards(null); load(); }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 space-y-6">
      <PageHero
        icon={Flame}
        badgeLabel="Review & Revision"
        title="Review & Revision"
        description="Spaced repetition flashcards, exam readiness predictions, weak topics, and quick review sessions."
      />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton-shimmer h-40 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* SM-2 flashcards due */}
          <SectionCard
            title="Flashcards due"
            subtitle="Spaced repetition — review cards scheduled for today"
          >
            {dueCards.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">No flashcards due right now. Check back later!</p>
            ) : (
              <div className="space-y-4">
                <p className="text-3xl font-bold text-[var(--ink)]">
                  {dueCards.length}
                  <span className="ml-2 text-sm font-normal text-[var(--ink-muted)]">card{dueCards.length === 1 ? "" : "s"} due</span>
                </p>
                <div className="space-y-1.5">
                  {dueCards.slice(0, 3).map((c) => (
                    <div key={c.id} className="rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-xs text-[var(--ink-muted)] truncate">
                      {c.front}
                    </div>
                  ))}
                  {dueCards.length > 3 && (
                    <p className="text-xs text-[var(--ink-muted)]">+{dueCards.length - 3} more</p>
                  )}
                </div>
                <button
                  onClick={() => setReviewCards(dueCards)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--rule)] bg-[var(--paper-sunken)] py-2.5 text-sm font-medium text-[#412454] transition hover:bg-[var(--paper-sunken)]"
                >
                  <Brain className="h-4 w-4" /> Start flashcard review
                </button>
              </div>
            )}
          </SectionCard>

          {/* Weak topics */}
          <SectionCard
            title="Weak topics"
            subtitle="Topics where your practice accuracy is below 70%"
          >
            {weakTopics.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">No weak topics yet. Complete a practice session to see trends.</p>
            ) : (
              <div className="space-y-2.5">
                {weakTopics.slice(0, 6).map((t) => (
                  <div key={t.topic} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm text-[var(--ink)]">{t.topic}</p>
                      <div className="mt-1 h-1.5 rounded-full bg-[var(--paper-sunken)]">
                        <div
                          className={`h-1.5 rounded-full ${masteryFill(t.accuracy_pct)}`}
                          style={{ width: `${t.accuracy_pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="flex-shrink-0 text-xs font-medium text-[var(--ink-muted)]">
                      {Math.round(t.accuracy_pct)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Upcoming exams + readiness */}
          <SectionCard
            title="Exam readiness"
            subtitle="AI prediction based on your practice history and time remaining"
            className="md:col-span-2"
          >
            {upcomingExams.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">No exams or tests coming up.</p>
            ) : (
              <div className="space-y-3">
                {upcomingExams.slice(0, 4).map((exam) => {
                  const r = readiness[exam.id];
                  return (
                    <div
                      key={exam.id}
                      className="flex items-center gap-4 rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-4"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--ink)]">{exam.title}</p>
                        {r ? (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <ReadinessBadge score={r.score} label={r.label} />
                            {r.daysLeft > 0 && (
                              <span className="text-xs text-[var(--ink-muted)]">
                                {r.daysLeft} day{r.daysLeft === 1 ? "" : "s"} left
                              </span>
                            )}
                            {r.weakTopics.length > 0 && (
                              <span className="text-xs text-[var(--ink-muted)]">
                                {r.weakTopics.length} weak topic{r.weakTopics.length === 1 ? "" : "s"}
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="mt-1 text-xs text-[var(--ink-muted)]">
                            <Loader2 className="inline h-3 w-3 animate-spin" /> Calculating readiness…
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => launchReview(exam.title, exam.course_id, 10)}
                        disabled={generating}
                        className="flex-shrink-0 flex items-center gap-1.5 rounded-xl border border-[var(--rule)] bg-[var(--paper-sunken)] px-3 py-2 text-xs font-medium text-[#412454] transition hover:bg-[var(--paper-sunken)] disabled:opacity-50"
                      >
                        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Practice
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* Quick review */}
          <SectionCard title="Quick review session">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[var(--ink-muted)]">Course</label>
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--blue-edge)]"
                >
                  <option value="">Select course</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <button
                onClick={async () => {
                  const topic = weakTopics[0]?.topic ?? "Review";
                  await launchReview(topic, courseId, 6);
                }}
                disabled={generating || !courseId || weakTopics.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--rule)] bg-[var(--blue-wash)] py-2.5 text-sm font-medium text-[var(--blue)] transition hover:bg-[var(--blue-wash)] disabled:opacity-50"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                {generating ? "Generating…" : "Start quick review"}
              </button>
              {actionMessage && <p className="text-xs text-[var(--ink-muted)]">{actionMessage}</p>}
            </div>
          </SectionCard>

          {/* Accuracy trend */}
          <SectionCard title="Accuracy trend" subtitle="Last 14 days">
            {trends.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">No quiz data yet.</p>
            ) : (
              <div className="space-y-2">
                {trends.map((t) => (
                  <div key={t.day} className="flex items-center gap-3">
                    <span className="w-20 flex-shrink-0 text-xs text-[var(--ink-muted)]">{t.day}</span>
                    <div className="flex-1 rounded-full bg-[var(--paper-sunken)] h-2">
                      <div
                        className={`h-2 rounded-full ${masteryFill(t.accuracy)}`}
                        style={{ width: `${t.accuracy}%` }}
                      />
                    </div>
                    <span className="w-10 flex-shrink-0 text-right text-xs text-[var(--ink-muted)]">{t.accuracy}%</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
