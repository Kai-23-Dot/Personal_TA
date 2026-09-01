"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Layers3, RotateCcw } from "lucide-react";
import { PageHero } from "@/frontend/components/ui/page-hero";
import { useSetPageContent } from "@/frontend/contexts/page-context";
import { usePersistentState } from "@/frontend/hooks/usePersistentState";
import {
  groupFlashcardsIntoDecks,
  type FlashcardDeck,
} from "@/frontend/lib/flashcardDecks";

type Course = { id: string; name: string };
type Flashcard = {
  id: string;
  front: string;
  back: string;
  hint: string | null;
  topic: string;
  difficulty: string;
  next_review: string;
  course_id: string | null;
  created_at: string;
  deck_id: string | null;
  deck_name: string | null;
};
type SavedSet = FlashcardDeck<Flashcard>;

export default function FlashcardsPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  // Draft form state — persisted so a half-configured set survives exit.
  const [courseId, setCourseId] = usePersistentState("smartlearn:flashcards:courseId", "");
  const [topic, setTopic] = usePersistentState("smartlearn:flashcards:topic", "");
  const [count, setCount] = usePersistentState("smartlearn:flashcards:count", 10);
  const [difficulty, setDifficulty] = usePersistentState<"mixed" | "easy" | "medium" | "hard">("smartlearn:flashcards:difficulty", "mixed");
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [view, setView] = useState<"form" | "cards">("form");
  const [savedSets, setSavedSets] = useState<SavedSet[]>([]);
  const [loadingSets, setLoadingSets] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch("/api/courses")
      .then((r) => r.json())
      .then((d) => { if (mounted) setCourses(Array.isArray(d) ? d : []); })
      .catch(() => { if (mounted) setCourses([]); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoadingSets(true);
    fetch("/api/flashcards/list?dueOnly=false")
      .then((r) => r.json())
      .then((data: Flashcard[]) => {
        if (!mounted) return;
        setSavedSets(
          groupFlashcardsIntoDecks(Array.isArray(data) ? data : [])
        );
      })
      .catch(() => { if (mounted) setSavedSets([]); })
      .finally(() => { if (mounted) setLoadingSets(false); });
    return () => { mounted = false; };
  }, []);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const normalizedCourseId = typeof courseId === "string" ? courseId.trim() : "";
      const trimmedTopic = typeof topic === "string" ? topic.trim() : "";
      const normalizedCount = Number.isFinite(count)
        ? Math.min(30, Math.max(5, Math.trunc(count)))
        : 10;
      const normalizedDifficulty = ["mixed", "easy", "medium", "hard"].includes(
        difficulty
      )
        ? difficulty
        : "mixed";
      const res = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(normalizedCourseId ? { courseId: normalizedCourseId } : {}),
          ...(trimmedTopic ? { topic: trimmedTopic } : {}),
          count: normalizedCount,
          difficulty: normalizedDifficulty,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        setMessage(data?.error || "Failed to generate flashcards.");
        return;
      }
      const newCards: Flashcard[] = data.flashcards ?? [];
      setCards(newCards);
      setCurrentIndex(0);
      setIsFlipped(false);
      setView("cards");
    } catch {
      setMessage("Could not reach the flashcard generator. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function startSet(set: SavedSet) {
    setCards(set.cards);
    setCurrentIndex(0);
    setIsFlipped(false);
    setView("cards");
  }

  function handleNewDeck() {
    setView("form");
    setCards([]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setMessage(null);
  }

  async function handleNext() {
    const card = cards[currentIndex];
    if (card) {
      fetch("/api/flashcards/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flashcardId: card.id, grade: 3 }),
      }).catch(() => {});
    }
    const nextIndex = currentIndex + 1;
    if (nextIndex >= cards.length) {
      setCurrentIndex(0);
      setIsFlipped(false);
    } else {
      setCurrentIndex(nextIndex);
      setIsFlipped(false);
    }
  }

  const current = cards[currentIndex];

  // Push visible card content so the AI Assistant can see it
  const screenContent = useMemo(() => {
    if (view !== "cards" || !current) return "";
    const lines = [
      `Flashcard Study — Topic: ${current.topic}`,
      `Card ${currentIndex + 1} of ${cards.length}`,
      `Question: ${current.front}`,
      isFlipped ? `Answer: ${current.back}` : "(Answer not yet revealed — card not flipped)",
    ];
    return lines.join("\n");
  }, [view, current, currentIndex, cards.length, isFlipped]);

  useSetPageContent(screenContent, "flashcard-session");

  // ── Cards view (focused) ──
  if (view === "cards" && cards.length > 0 && current) {
    const questionUsesReadingLayout =
      current.front.length > 220 || current.front.includes("\n");
    const answerUsesReadingLayout =
      current.back.length > 280 || current.back.includes("\n");

    return (
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-4 sm:px-6 sm:pt-6">
        <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleNewDeck}
            className="inline-flex min-h-10 w-fit items-center gap-2 rounded-full px-3 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            New deck
          </button>
          <p
            className="max-w-full truncate text-sm font-medium text-slate-500 sm:max-w-[65%] sm:text-right"
            title={current.topic}
          >
            {current.topic}
          </p>
        </div>

        <div className="mb-3 flex items-end justify-between gap-4">
          <p aria-live="polite" className="text-sm text-slate-400 sm:text-base">
            Card <span className="font-semibold text-slate-100">{currentIndex + 1}</span> of{" "}
            <span className="font-semibold text-slate-100">{cards.length}</span>
          </p>
          <p className="text-xs font-medium text-slate-600">
            {Math.round(((currentIndex + 1) / cards.length) * 100)}% complete
          </p>
        </div>

        <div
          role="progressbar"
          aria-label="Deck progress"
          aria-valuemin={1}
          aria-valuemax={cards.length}
          aria-valuenow={currentIndex + 1}
          className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-300 shadow-[0_0_14px_rgba(56,189,248,0.35)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
          />
        </div>

        <div
          key={currentIndex}
          style={{ perspective: "1600px" }}
          className="animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none"
        >
          <div
            role="button"
            tabIndex={0}
            onClick={() => setIsFlipped((flipped) => !flipped)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setIsFlipped((flipped) => !flipped);
              }
            }}
            aria-pressed={isFlipped}
            className="group relative block h-[clamp(22rem,52vh,31rem)] w-full cursor-pointer rounded-[1.75rem] text-left outline-none transition-transform duration-300 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-sky-300/70 focus-visible:ring-offset-4 focus-visible:ring-offset-[#050814] active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none sm:h-[clamp(24rem,54vh,32rem)]"
          >
            <span className="sr-only">
              {isFlipped
                ? "Showing the answer. Activate to return to the question."
                : "Showing the question. Activate to reveal the answer."}
            </span>
            <div
              className="relative h-full w-full transition-transform duration-700 motion-reduce:transition-none"
              data-side={isFlipped ? "answer" : "question"}
              style={{
                transformStyle: "preserve-3d",
                WebkitTransformStyle: "preserve-3d",
                transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                transitionTimingFunction: "cubic-bezier(0.2, 0.72, 0.2, 1)",
              }}
            >
              <div
                aria-hidden={isFlipped}
                className="absolute inset-0 flex flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.98),rgba(7,12,26,0.97))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:p-8 md:p-10"
                style={{
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                }}
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(139,92,246,0.14),transparent_42%),radial-gradient(circle_at_90%_90%,rgba(56,189,248,0.08),transparent_38%)]" />
                <div className="relative flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-violet-300 sm:text-sm">
                    <span className="size-2 rounded-full bg-violet-300 shadow-[0_0_12px_rgba(196,181,253,0.7)]" />
                    Question
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <RotateCcw aria-hidden="true" className="size-3.5" />
                    Tap to flip
                  </span>
                </div>

                <div
                  data-card-scroll="question"
                  onClick={(event) => event.stopPropagation()}
                  className="relative my-4 min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-1 sm:my-6 sm:px-4"
                  style={{ scrollbarGutter: "stable" }}
                >
                  <div
                    className={`flex min-h-full w-full justify-center py-3 ${
                      questionUsesReadingLayout ? "items-start" : "items-center"
                    }`}
                  >
                    <p
                      className={`max-w-2xl whitespace-pre-wrap break-words font-semibold tracking-[-0.02em] text-slate-50 ${
                        questionUsesReadingLayout
                          ? "text-left text-[clamp(1.05rem,2.5vw,1.45rem)] leading-[1.7]"
                          : "text-balance text-center text-[clamp(1.2rem,3vw,1.8rem)] leading-[1.55]"
                      }`}
                    >
                      {current.front}
                    </p>
                  </div>
                </div>

                <p className="relative text-center text-xs font-medium text-slate-500 sm:text-sm">
                  Tap the card or press Space to reveal the answer
                </p>
              </div>

              <div
                aria-hidden={!isFlipped}
                className="absolute inset-0 flex flex-col overflow-hidden rounded-[1.75rem] border border-sky-300/25 bg-[linear-gradient(145deg,rgba(8,22,42,0.99),rgba(6,13,29,0.98))] p-5 shadow-[0_24px_90px_rgba(14,116,144,0.16),0_24px_70px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:p-8 md:p-10"
                style={{
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_8%,rgba(34,211,238,0.13),transparent_40%),radial-gradient(circle_at_10%_90%,rgba(59,130,246,0.08),transparent_38%)]" />
                <div className="relative flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-300 sm:text-sm">
                    <span className="size-2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.75)]" />
                    Answer
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <RotateCcw aria-hidden="true" className="size-3.5" />
                    Tap to flip back
                  </span>
                </div>

                <div
                  data-card-scroll="answer"
                  onClick={(event) => event.stopPropagation()}
                  className="relative my-4 min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-1 sm:my-6 sm:px-4"
                  style={{ scrollbarGutter: "stable" }}
                >
                  <div
                    className={`flex min-h-full w-full justify-center py-3 ${
                      answerUsesReadingLayout ? "items-start" : "items-center"
                    }`}
                  >
                    <p
                      className={`max-w-2xl whitespace-pre-wrap break-words font-medium tracking-[-0.01em] text-slate-100 ${
                        answerUsesReadingLayout
                          ? "text-left text-[clamp(1rem,2.2vw,1.3rem)] leading-[1.75]"
                          : "text-balance text-center text-[clamp(1.05rem,2.5vw,1.5rem)] leading-[1.7]"
                      }`}
                    >
                      {current.back}
                    </p>
                  </div>
                </div>

                <p className="relative text-center text-xs font-medium text-slate-500 sm:text-sm">
                  Flip back whenever you want to review the question
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className={`mt-5 grid gap-3 ${isFlipped ? "sm:grid-cols-2" : ""}`}>
          <button
            type="button"
            onClick={() => setIsFlipped((flipped) => !flipped)}
            className={`inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border px-5 text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70 active:scale-[0.985] motion-reduce:transition-none sm:text-base ${
              isFlipped
                ? "border-white/[0.12] bg-white/[0.055] text-slate-200 hover:border-sky-300/30 hover:bg-sky-300/[0.08] hover:text-white"
                : "border-sky-200/40 bg-gradient-to-r from-slate-50 to-sky-100 text-slate-950 shadow-[0_12px_36px_rgba(56,189,248,0.16)] hover:from-white hover:to-cyan-100"
            }`}
          >
            <RotateCcw
              aria-hidden="true"
              className={`size-4 transition-transform duration-500 motion-reduce:transition-none ${
                isFlipped ? "-rotate-180" : ""
              }`}
            />
            {isFlipped ? "View question" : "Reveal answer"}
          </button>

          {isFlipped && (
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-sky-200/40 bg-gradient-to-r from-slate-50 to-sky-100 px-5 text-sm font-bold text-slate-950 shadow-[0_12px_36px_rgba(56,189,248,0.16)] transition-all duration-200 hover:from-white hover:to-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70 active:scale-[0.985] motion-reduce:transition-none sm:text-base"
            >
              {currentIndex + 1 >= cards.length
                ? "Review deck again"
                : "Next flashcard"}
              {currentIndex + 1 >= cards.length ? (
                <RotateCcw aria-hidden="true" className="size-4" />
              ) : (
                <ArrowRight aria-hidden="true" className="size-4" />
              )}
            </button>
          )}
        </div>

        <p className="mt-4 text-center text-xs leading-5 text-slate-600">
          You can flip the current card as many times as you need before moving on.
        </p>
      </div>
    );
  }

  // ── Form view ──
  return (
    <div className="mx-auto max-w-2xl px-4 pb-20 pt-6">
      <PageHero
        className="mb-8"
        icon={Layers3}
        badgeLabel="Spaced Repetition"
        title="Flashcards"
        description="Generate AI flashcard sets from your notes and courses, then study them with spaced repetition."
      />

      {/* ── Saved sets library ── */}
      {(loadingSets || savedSets.length > 0) && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Layers3 className="h-4 w-4 text-violet-300" />
            <h3 className="text-sm font-semibold text-white">My Flashcard Sets</h3>
            {!loadingSets && <span className="text-xs text-slate-500">({savedSets.length})</span>}
          </div>
          {loadingSets ? (
            <div className="grid gap-2">
              {[1,2].map((i) => <div key={i} className="skeleton-shimmer h-14 rounded-xl" />)}
            </div>
          ) : (
            <div className="grid gap-2">
              {savedSets.map((set) => (
                <button
                  key={set.id}
                  type="button"
                  onClick={() => startSet(set)}
                  className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/3 px-4 py-3 text-left transition-all hover:border-violet-400/30 hover:bg-violet-400/5 active:scale-[0.99]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
                    <Layers3 className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{set.name}</p>
                    <p className="text-xs text-slate-500">{set.count} card{set.count !== 1 ? "s" : ""}</p>
                  </div>
                  <span className="text-xs text-slate-600 group-hover:text-slate-400 transition-colors">Study →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Generate form */}
      <div className="mb-10 rounded-2xl border border-white/10 bg-[rgba(9,12,24,0.72)] p-6 shadow-sm backdrop-blur">
        <h2 className="mb-1 text-base font-semibold text-white">Generate flashcards</h2>
        <p className="mb-5 text-sm text-slate-400">Generate AI flashcards from your course notes.</p>
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-300" htmlFor="fc-course">Course</label>
            <select
              id="fc-course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              required
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-400/40 focus:bg-sky-500/5 transition-colors"
            >
              <option value="">Select a course</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-300" htmlFor="fc-topic">Topic (optional)</label>
            <input
              id="fc-topic"
              type="text"
              placeholder="e.g. Photosynthesis"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-sky-400/40 focus:bg-sky-500/5 transition-colors"
            />
            <p className="text-xs text-slate-500">
              Leave blank to create a course-wide review deck.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-300">Difficulty</label>
            <div className="grid grid-cols-4 gap-2">
              {(["mixed", "easy", "medium", "hard"] as const).map((d) => {
                const colors: Record<string, string> = {
                  mixed: "border-sky-400/50 bg-sky-400/15 text-sky-100 shadow-[0_0_12px_rgba(56,189,248,0.1)]",
                  easy: "border-emerald-400/50 bg-emerald-400/15 text-emerald-100 shadow-[0_0_12px_rgba(52,211,153,0.1)]",
                  medium: "border-amber-400/50 bg-amber-400/15 text-amber-100 shadow-[0_0_12px_rgba(251,191,36,0.1)]",
                  hard: "border-red-400/50 bg-red-400/15 text-red-100 shadow-[0_0_12px_rgba(248,113,113,0.1)]",
                };
                const inactive = "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200";
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={`rounded-xl border py-2 text-xs font-semibold capitalize transition-all duration-150 active:scale-95 ${
                      difficulty === d ? colors[d] : inactive
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-300" htmlFor="fc-count">Number of cards</label>
            <input
              id="fc-count"
              type="number"
              min={5}
              max={30}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-400/40 focus:bg-sky-500/5 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full active:scale-[0.98] transition-transform duration-100"
          >
            {loading ? "Generating..." : "Generate flashcards"}
          </button>

          {message ? (
            <p className="text-center text-sm text-red-400">{message}</p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
