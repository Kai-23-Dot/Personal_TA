"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Brain, CheckCircle2, Flame, Loader2,
  Sparkles, Target, X,
} from "lucide-react";
import { PageHero } from "@/frontend/components/ui/page-hero";
import { Button } from "@/frontend/components/ui/button";
import { WorkspacePage, WorkspaceSectionHeader, WorkspaceSurface } from "@/frontend/components/workspace/workspace-primitives";

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
        <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-500/15">
          <CheckCircle2 className="h-7 w-7 text-emerald-400" />
        </div>
        <p className="text-lg font-semibold text-white">Session complete!</p>
        <p className="text-sm text-slate-400">
          {correct} of {cards.length} cards recalled correctly
        </p>
        <button
          onClick={onDone}
          className="mt-2 rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white"
        >
          Back to review
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{idx + 1} of {cards.length}</span>
        <div className="flex gap-1">
          {cards.map((_, i) => (
            <div key={i} className={`h-1.5 w-5 rounded-full ${i < idx ? "bg-emerald-500" : i === idx ? "bg-sky-400" : "bg-white/10"}`} />
          ))}
        </div>
      </div>

      {/* Card */}
      <button
        type="button"
        className="flex min-h-[160px] w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card p-8 text-center transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setFlipped(!flipped)}
      >
        {!flipped ? (
          <>
            <p className="text-lg font-medium text-white leading-relaxed">{card.front}</p>
            <p className="text-xs text-slate-500">Tap to reveal answer</p>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">Answer</p>
            <p className="text-base text-slate-200 leading-relaxed">{card.back}</p>
          </>
        )}
      </button>

      {/* Grade buttons */}
      {flipped && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { g: 0, label: "Forgot", color: "border-rose-400/30 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25" },
            { g: 2, label: "Hard",   color: "border-orange-400/25 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20" },
            { g: 3, label: "Good",   color: "border-amber-400/25 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20" },
            { g: 5, label: "Easy",   color: "border-emerald-400/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20" },
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
          className="w-full rounded-xl border border-sky-400/25 bg-sky-500/10 py-2.5 text-sm font-medium text-sky-200 transition hover:bg-sky-500/20"
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
    score >= 80 ? "text-emerald-400 border-emerald-400/30 bg-emerald-500/10" :
    score >= 60 ? "text-sky-400 border-sky-400/30 bg-sky-500/10" :
    score >= 40 ? "text-amber-300 border-amber-400/25 bg-amber-400/8" :
    "text-rose-400 border-rose-400/30 bg-rose-500/10";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${color}`}>
      <span>{score}%</span>
      <span className="font-normal opacity-80">{label}</span>
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

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
      <WorkspacePage className="max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-400">
            Flashcard review — {reviewCards.length} due card{reviewCards.length === 1 ? "" : "s"}
          </p>
          <button
            onClick={() => { setReviewCards(null); load(); }}
            className="text-slate-500 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <FlashcardReview cards={reviewCards} onDone={() => { setReviewCards(null); load(); }} />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage className="space-y-5">
      <PageHero
        icon={Flame}
        badgeLabel="Study"
        title="Review"
        description="One queue for due flashcards, weak topics, and upcoming assessments—with a reason for every recommendation."
      />

      {loading ? (
        <div className="space-y-3">
          <div className="skeleton-shimmer h-14 rounded-lg" />
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton-shimmer h-20 rounded-lg" />)}
        </div>
      ) : (
        <div className="space-y-4">
          <WorkspaceSurface>
            <WorkspaceSectionHeader title="Review queue" description="Ordered by what is due and what evidence says needs work" />
            {dueCards.length === 0 && upcomingExams.length === 0 && weakTopics.length === 0 ? <div className="px-5 py-12 text-center"><CheckCircle2 className="mx-auto h-6 w-6 text-success" /><p className="mt-3 text-sm font-medium">Your review queue is clear</p><p className="mt-1 text-xs text-muted-foreground">Complete practice or create flashcards to build the next queue.</p></div> : <div>
              {dueCards.length > 0 ? <div className="grid gap-3 border-b border-border px-4 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center"><span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary"><Brain className="h-4 w-4" /></span><div className="min-w-0"><p className="text-sm font-medium">Review {dueCards.length} due flashcard{dueCards.length === 1 ? "" : "s"}</p><p className="mt-0.5 text-xs text-muted-foreground">Recommended because spaced repetition scheduled these cards for today.</p></div><Button size="sm" onClick={() => setReviewCards(dueCards)}>Start review</Button></div> : null}
              {upcomingExams.slice(0, 4).map((exam) => { const result = readiness[exam.id]; return <div key={exam.id} className="grid gap-3 border-b border-border px-4 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center"><span className="grid h-8 w-8 place-items-center rounded-md bg-warning/10 text-warning"><Sparkles className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-medium">{exam.title}</p>{result ? <div className="mt-1 flex flex-wrap items-center gap-2"><ReadinessBadge score={result.score} label={result.label} /><span className="text-xs text-muted-foreground">Recommended because {result.daysLeft > 0 ? `${result.daysLeft} day${result.daysLeft === 1 ? "" : "s"} remain` : "it is due now"}{result.weakTopics.length ? ` and ${result.weakTopics.length} weak topic${result.weakTopics.length === 1 ? " is" : "s are"} detected` : ""}.</span></div> : <p className="mt-1 text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Calculating readiness…</p>}</div><Button size="sm" variant="secondary" onClick={() => void launchReview(exam.title, exam.course_id, 10)} disabled={generating}>Practice</Button></div>; })}
              {weakTopics.slice(0, 5).map((topic) => <div key={topic.topic} className="grid gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center"><span className="grid h-8 w-8 place-items-center rounded-md bg-danger/10 text-danger"><Target className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-medium">{topic.topic}</p><p className="mt-0.5 text-xs text-muted-foreground">Recommended because recent practice accuracy is {Math.round(topic.accuracy_pct)}%, below the 70% mastery threshold.</p></div><Button size="sm" variant="secondary" onClick={() => void launchReview(topic.topic, courseId, 6)} disabled={generating || !courseId}>Practice</Button></div>)}
            </div>}
          </WorkspaceSurface>

          <div className="grid gap-4 lg:grid-cols-2">
            <WorkspaceSurface><WorkspaceSectionHeader title="Quick review" description="Start with the weakest available topic" /><div className="space-y-3 p-4"><label className="block"><span className="mb-1 block text-xs text-muted-foreground">Course</span><select value={courseId} onChange={(event) => setCourseId(event.target.value)} className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"><option value="">Select course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label><Button className="w-full" onClick={() => void launchReview(weakTopics[0]?.topic ?? "Review", courseId, 6)} disabled={generating || !courseId || weakTopics.length === 0}>{generating ? <Loader2 className="animate-spin" /> : <Target />}{generating ? "Generating…" : "Start quick review"}</Button>{actionMessage ? <p className="text-xs leading-5 text-danger" role="alert">{actionMessage}</p> : null}</div></WorkspaceSurface>
            <WorkspaceSurface><WorkspaceSectionHeader title="Accuracy trend" description="Real completed-practice accuracy from the last 14 days" />{trends.length === 0 ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">No completed quiz data yet.</p> : <div className="divide-y divide-border px-4">{trends.map((trend) => <div key={trend.day} className="flex items-center gap-3 py-2.5"><span className="w-20 shrink-0 text-xs text-muted-foreground">{trend.day}</span><div className="h-1.5 flex-1 rounded-full bg-surface-2"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${trend.accuracy}%` }} /></div><span className="w-10 text-right text-xs font-medium">{trend.accuracy}%</span></div>)}</div>}</WorkspaceSurface>
          </div>
        </div>
      )}
    </WorkspacePage>
  );
}
