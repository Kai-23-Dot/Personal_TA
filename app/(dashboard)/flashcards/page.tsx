"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers3 } from "lucide-react";
import { PageHero } from "@/frontend/components/ui/page-hero";
import { useSetPageContent } from "@/frontend/contexts/page-context";
import { usePersistentState } from "@/frontend/hooks/usePersistentState";

type Course = { id: string; name: string };
type Flashcard = {
  id: string;
  front: string;
  back: string;
  hint: string | null;
  topic: string;
  difficulty: string;
  next_review: string;
};
type SavedSet = { topic: string; count: number; cards: Flashcard[] };

export default function FlashcardsPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  // Draft form state — persisted so a half-configured set survives exit.
  const [courseId, setCourseId] = usePersistentState("conlearn:flashcards:courseId", "");
  const [noteId] = useState("");
  const [topic, setTopic] = usePersistentState("conlearn:flashcards:topic", "");
  const [count, setCount] = usePersistentState("conlearn:flashcards:count", 10);
  const [difficulty, setDifficulty] = usePersistentState<"mixed" | "easy" | "medium" | "hard">("conlearn:flashcards:difficulty", "mixed");
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
        const byTopic = new Map<string, Flashcard[]>();
        for (const card of (Array.isArray(data) ? data : [])) {
          if (!byTopic.has(card.topic)) byTopic.set(card.topic, []);
          byTopic.get(card.topic)!.push(card);
        }
        setSavedSets(Array.from(byTopic.entries()).map(([topic, cards]) => ({ topic, count: cards.length, cards })));
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
      const res = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteId: noteId || null,
          courseId: courseId || null,
          topic: topic || undefined,
          count,
          difficulty,
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

  useSetPageContent(screenContent);

  // ── Cards view (focused) ──
  if (view === "cards" && cards.length > 0 && current) {
    return (
      <div className="mx-auto max-w-2xl px-4 pb-20 pt-6">
        {/* Minimal header */}
        <div className="mb-8 flex items-center justify-between">
          <button
            type="button"
            onClick={handleNewDeck}
            className="text-sm text-slate-400 transition hover:text-slate-200"
          >
            ← New Deck
          </button>
          <p className="text-xs text-slate-500">{current.topic}</p>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <p className="text-sm text-slate-400">
            Card <span className="font-medium text-white">{currentIndex + 1}</span> of{" "}
            <span className="font-medium text-white">{cards.length}</span>
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-6 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-sky-400 transition-all duration-500"
            style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
          />
        </div>

        {/* Card with 3D flip */}
        <div
          key={currentIndex}
          style={{ perspective: "1200px" }}
          className="mb-6"
        >
          <div
            onClick={() => { if (!isFlipped) setIsFlipped(true); }}
            style={{
              position: "relative",
              width: "100%",
              minHeight: "260px",
              transformStyle: "preserve-3d",
              transition: "transform 0.55s cubic-bezier(0.4, 0.2, 0.2, 1)",
              transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
              cursor: isFlipped ? "default" : "pointer",
            }}
          >
            {/* Front face */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                borderRadius: "20px",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(9,12,26,0.82)",
                boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "2.5rem 2rem",
                gap: "1.25rem",
                backdropFilter: "blur(12px)",
                userSelect: "none",
              }}
            >
              <p style={{ color: "#7dd3fc", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Question
              </p>
              <p style={{ color: "#f1f5f9", fontSize: "1.15rem", lineHeight: 1.75, textAlign: "center", fontWeight: 400 }}>
                {current.front}
              </p>
              <p style={{ color: "#475569", fontSize: "0.8rem", marginTop: "0.5rem" }}>
                Tap to reveal answer
              </p>
            </div>

            {/* Back face */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
                borderRadius: "20px",
                border: "1px solid rgba(125,211,252,0.2)",
                background: "rgba(10,20,40,0.9)",
                boxShadow: "0 12px 48px rgba(0,0,0,0.45), 0 0 60px rgba(56,189,248,0.05)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "2.5rem 2rem",
                gap: "1.25rem",
                backdropFilter: "blur(12px)",
              }}
            >
              <p style={{ color: "#38bdf8", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Answer
              </p>
              <p style={{ color: "#e2e8f0", fontSize: "1.1rem", lineHeight: 1.8, textAlign: "center", fontWeight: 400, whiteSpace: "pre-wrap" }}>
                {current.back}
              </p>
            </div>
          </div>
        </div>

        {/* Next button — appears after flip */}
        <div
          style={{
            transition: "opacity 0.3s ease, transform 0.3s ease",
            opacity: isFlipped ? 1 : 0,
            transform: isFlipped ? "translateY(0)" : "translateY(8px)",
            pointerEvents: isFlipped ? "auto" : "none",
          }}
        >
          <button
            type="button"
            onClick={handleNext}
            className="btn btn-primary w-full active:scale-[0.98] transition-transform duration-100"
          >
            {currentIndex + 1 >= cards.length ? "Finish →" : "Next Flashcard →"}
          </button>
        </div>
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
                  key={set.topic}
                  type="button"
                  onClick={() => startSet(set)}
                  className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/3 px-4 py-3 text-left transition-all hover:border-violet-400/30 hover:bg-violet-400/5 active:scale-[0.99]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
                    <Layers3 className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{set.topic}</p>
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
              max={40}
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
