"use client";

import { useEffect, useState } from "react";

type Course = { id: string; name: string };
type Note = { id: string; title: string };
type Flashcard = {
  id: string;
  front: string;
  back: string;
  hint: string | null;
  topic: string;
  difficulty: string;
  next_review: string;
};

export default function FlashcardsPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteId, setNoteId] = useState("");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [reviewCards, setReviewCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const coursesRes = await fetch("/api/courses");
      const coursesData = coursesRes.ok ? await coursesRes.json() : [];
      if (mounted) setCourses(Array.isArray(coursesData) ? coursesData : []);
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadNotes() {
      if (!courseId) {
        setNotes([]);
        setNoteId("");
        return;
      }
      const res = await fetch(`/api/notes/list?courseId=${courseId}`);
      const data = await res.json();
      if (mounted) setNotes(Array.isArray(data) ? data : []);
    }
    loadNotes();
    return () => {
      mounted = false;
    };
  }, [courseId]);

  async function loadDueCards() {
    const res = await fetch(`/api/flashcards/list?courseId=${courseId}`);
    const data = await res.json();
    setReviewCards(Array.isArray(data) ? data : []);
    setCurrentIndex(0);
    setShowBack(false);
  }

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
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        setMessage(data?.error || "Failed to generate flashcards.");
        return;
      }
      setMessage(`Generated ${data.count} flashcards.`);
      await loadDueCards();
    } finally {
      setLoading(false);
    }
  }

  async function gradeCard(grade: number) {
    const card = reviewCards[currentIndex];
    if (!card) return;
    await fetch("/api/flashcards/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flashcardId: card.id, grade }),
    });
    const nextIndex = currentIndex + 1;
    if (nextIndex >= reviewCards.length) {
      await loadDueCards();
    } else {
      setCurrentIndex(nextIndex);
      setShowBack(false);
    }
  }

  const current = reviewCards[currentIndex];

  return (
    <section className="section">
      <h2 className="animate-on-scroll">Flashcards</h2>

      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Generate flashcards</h3>
          <form className="contact-form" onSubmit={handleGenerate}>
            <div className="form-field">
              <label htmlFor="course">Course</label>
              <select id="course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">Select a course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="note">Note (optional)</label>
              <select id="note" value={noteId} onChange={(e) => setNoteId(e.target.value)}>
                <option value="">Any recent notes</option>
                {notes.map((note) => (
                  <option key={note.id} value={note.id}>{note.title}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="topic">Topic (optional)</label>
              <input
                id="topic"
                type="text"
                placeholder="e.g. Photosynthesis"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="count">Number of cards</label>
              <input
                id="count"
                type="number"
                min={5}
                max={40}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </div>
            <button type="submit" className="contact-submit-btn" disabled={loading}>
              {loading ? "Generating..." : "Generate Flashcards"}
            </button>
            {message ? <div className="form-message" style={{ display: "block" }}>{message}</div> : null}
          </form>
        </div>
      </div>

      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "2rem auto 0" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Review due cards</h3>
          {!current ? (
            <p style={{ color: "var(--gray)" }}>No due cards right now. Generate new cards or check back later.</p>
          ) : (
            <div style={{ display: "grid", gap: "1rem" }}>
              <div
                style={{
                  padding: "1.5rem",
                  borderRadius: "16px",
                  background: "rgba(9, 14, 24, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                }}
              >
                <strong style={{ color: "var(--light)" }}>
                  {showBack ? "Answer" : "Question"}
                </strong>
                <p style={{ color: "var(--light)", marginTop: "0.75rem", whiteSpace: "pre-wrap" }}>
                  {showBack ? current.back : current.front}
                </p>
                {current.hint && !showBack ? (
                  <p style={{ color: "var(--gray)", marginTop: "0.5rem" }}>Hint: {current.hint}</p>
                ) : null}
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginTop: "1rem" }}
                  onClick={() => setShowBack((v) => !v)}
                >
                  {showBack ? "Hide answer" : "Show answer"}
                </button>
              </div>

              {showBack ? (
                <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                  <button className="btn btn-secondary" type="button" onClick={() => gradeCard(1)}>Hard</button>
                  <button className="btn btn-secondary" type="button" onClick={() => gradeCard(3)}>Good</button>
                  <button className="btn btn-primary" type="button" onClick={() => gradeCard(5)}>Easy</button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
