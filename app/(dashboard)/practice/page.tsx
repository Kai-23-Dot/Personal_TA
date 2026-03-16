"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const difficultyOptions = [
  { value: "adaptive", label: "Adaptive" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

type Course = {
  id: string;
  name: string;
};

type NoteListItem = {
  id: string;
  title: string;
  updated_at: string;
};

export default function PracticePage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [selectedNotes, setSelectedNotes] = useState<Record<string, boolean>>({});
  const [topic, setTopic] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState("adaptive");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/courses")
      .then((res) => res.json())
      .then((data) => {
        if (mounted) setCourses(data ?? []);
      })
      .catch(() => {
        if (mounted) setCourses([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadNotes() {
      if (!courseId) {
        setNotes([]);
        setSelectedNotes({});
        return;
      }
      try {
        const res = await fetch(`/api/notes/list?courseId=${courseId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load notes");
        if (mounted) {
          setNotes(data ?? []);
          setSelectedNotes({});
        }
      } catch {
        if (mounted) {
          setNotes([]);
          setSelectedNotes({});
        }
      }
    }
    loadNotes();
    return () => {
      mounted = false;
    };
  }, [courseId]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const noteIds = Object.entries(selectedNotes)
        .filter(([, selected]) => selected)
        .map(([id]) => id);

      const res = await fetch("/api/practice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          courseId: courseId || null,
          difficulty,
          questionCount,
          noteIds: noteIds.length > 0 ? noteIds : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        setError(data?.error || "Failed to generate practice test.");
        return;
      }
      if (data.sessionId) {
        router.push(`/practice/session?sessionId=${data.sessionId}`);
      } else {
        setError("Missing session id from practice generator.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section">
      <h2 className="animate-on-scroll">Practice Tests</h2>
      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Generate a practice test</h3>
          <form className="contact-form" onSubmit={handleGenerate}>
            <div className="form-field">
              <label htmlFor="course">Course</label>
              <select
                id="course"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                required
                style={{
                  padding: "0.8rem 1rem",
                  background: "rgba(255, 255, 255, 0.12)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "10px",
                  color: "var(--light)",
                }}
              >
                <option value="">Select a course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
              {courses.length === 0 ? (
                <p style={{ color: "var(--gray)", marginTop: "0.5rem" }}>
                  No courses found. Sync Canvas on the Dashboard first.
                </p>
              ) : null}
            </div>
            <div className="form-field">
              <label htmlFor="topic">Topic</label>
              <input
                id="topic"
                type="text"
                placeholder="e.g. Quadratic equations"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label>Practice from selected notes (optional)</label>
              {courseId && notes.length === 0 ? (
                <p style={{ color: "var(--gray)", marginTop: "0.5rem" }}>
                  No notes found for this course yet. Upload or import notes first.
                </p>
              ) : null}
              {notes.length > 0 ? (
                <div
                  style={{
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "12px",
                    padding: "0.8rem",
                    maxHeight: "240px",
                    overflowY: "auto",
                    background: "rgba(9, 14, 24, 0.6)",
                  }}
                >
                  {notes.map((note) => (
                    <label
                      key={note.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        padding: "0.4rem 0",
                        color: "var(--light)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(selectedNotes[note.id])}
                        onChange={(e) =>
                          setSelectedNotes((prev) => ({ ...prev, [note.id]: e.target.checked }))
                        }
                      />
                      <span>{note.title}</span>
                    </label>
                  ))}
                </div>
              ) : null}
              {notes.length > 0 ? (
                <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.8rem" }}>
                  <button
                    type="button"
                    className="contact-submit-btn"
                    style={{ width: "auto", padding: "0.55rem 1.4rem" }}
                    onClick={() => {
                      const next: Record<string, boolean> = {};
                      notes.forEach((note) => {
                        next[note.id] = true;
                      });
                      setSelectedNotes(next);
                    }}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="contact-submit-btn"
                    style={{
                      width: "auto",
                      padding: "0.55rem 1.4rem",
                      background: "rgba(255, 255, 255, 0.12)",
                      color: "var(--light)",
                    }}
                    onClick={() => setSelectedNotes({})}
                  >
                    Clear
                  </button>
                </div>
              ) : null}
            </div>
            <div className="form-field">
              <label htmlFor="questions">Number of questions</label>
              <input
                id="questions"
                type="number"
                min={5}
                max={50}
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
              />
            </div>
            <div className="form-field">
              <label htmlFor="difficulty">Difficulty</label>
              <select
                id="difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                style={{
                  padding: "0.8rem 1rem",
                  background: "rgba(255, 255, 255, 0.12)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "10px",
                  color: "var(--light)",
                }}
              >
                {difficultyOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="contact-submit-btn" disabled={loading}>
              {loading ? "Generating..." : "Generate Test"}
            </button>
            {error ? <div className="form-message error" style={{ display: "block" }}>{error}</div> : null}
          </form>
        </div>
      </div>
    </section>
  );
}
