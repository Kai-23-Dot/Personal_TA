"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const difficultyOptions = [
  { value: "adaptive", label: "Adaptive" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const modeOptions = [
  { value: "quiz", label: "Quiz" },
  { value: "flashcards", label: "Flashcards" },
  { value: "mixed", label: "Mixed" },
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

type Assignment = {
  id: string;
  title: string;
  course_id: string;
};

type ResumeEntry = {
  sessionId: string;
  topic: string;
  total: number;
  answeredCount: number;
  savedAt: string;
};

export default function PracticePage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [selectedNotes, setSelectedNotes] = useState<Record<string, boolean>>({});
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentId, setAssignmentId] = useState("");
  const [topic, setTopic] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState("adaptive");
  const [mode, setMode] = useState("quiz");
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumable, setResumable] = useState<ResumeEntry[]>([]);

  // Scan localStorage for saved practice sessions
  useEffect(() => {
    const entries: ResumeEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("practice_resume_")) continue;
      const sid = key.replace("practice_resume_", "");
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
        entries.push({
          sessionId: sid,
          topic: parsed.topic ?? "Practice Test",
          total: parsed.total ?? 0,
          answeredCount: Object.keys(parsed.answers ?? {}).length,
          savedAt: parsed.savedAt ?? "",
        });
      } catch {
        // skip corrupt entries
      }
    }
    setResumable(entries);
  }, []);

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
      setLoadingNotes(true);
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
      } finally {
        if (mounted) setLoadingNotes(false);
      }
    }
    loadNotes();
    return () => {
      mounted = false;
    };
  }, [courseId]);

  useEffect(() => {
    let mounted = true;
    async function loadAssignments() {
      if (!courseId) {
        setAssignments([]);
        setAssignmentId("");
        return;
      }
      const res = await fetch(`/api/assignments?course_id=${courseId}`);
      const data = await res.json();
      if (mounted) setAssignments(data ?? []);
    }
    loadAssignments();
    return () => {
      mounted = false;
    };
  }, [courseId]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const assignmentTitle = assignments.find((a) => a.id === assignmentId)?.title ?? "";
      const effectiveTopic = topic || assignmentTitle || "Course practice";
      const noteIds = Object.entries(selectedNotes)
        .filter(([, selected]) => selected)
        .map(([id]) => id);

      if (mode === "flashcards") {
        const res = await fetch("/api/flashcards/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId: noteIds[0] ?? null,
            courseId: courseId || null,
            topic: effectiveTopic,
            count: Math.min(Math.max(questionCount, 5), 40),
          }),
        });
        const data = await res.json();
        if (!res.ok || data?.success === false) {
          setError(data?.error || "Failed to generate flashcards.");
          return;
        }
        router.push("/flashcards");
      } else {
        const res = await fetch("/api/practice/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: effectiveTopic,
            courseId: courseId || null,
            difficulty,
            questionCount,
            noteIds: noteIds.length > 0 ? noteIds : undefined,
            assignmentId: assignmentId || null,
            mode,
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
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function dismissResume(sessionId: string) {
    try { localStorage.removeItem(`practice_resume_${sessionId}`); } catch {}
    setResumable((prev) => prev.filter((e) => e.sessionId !== sessionId));
  }

  return (
    <section className="section">
      {resumable.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <h3 style={{ color: "var(--light)", marginBottom: "0.75rem", fontSize: "1rem", fontWeight: 600 }}>
            Resume in-progress tests
          </h3>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {resumable.map((entry) => (
              <div
                key={entry.sessionId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.9rem 1.2rem",
                  borderRadius: "14px",
                  border: "1px solid rgba(125,211,252,0.2)",
                  background: "rgba(9,12,26,0.72)",
                  gap: "1rem",
                }}
              >
                <div>
                  <p style={{ color: "var(--light)", fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.2rem" }}>
                    {entry.topic}
                  </p>
                  <p style={{ color: "var(--gray)", fontSize: "0.78rem" }}>
                    {entry.answeredCount}{entry.total ? ` / ${entry.total}` : ""} questions answered
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ fontSize: "0.8rem", padding: "0.45rem 1rem" }}
                    onClick={() => router.push(`/practice/session?sessionId=${entry.sessionId}`)}
                  >
                    Resume →
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: "0.8rem", padding: "0.45rem 0.75rem" }}
                    onClick={() => dismissResume(entry.sessionId)}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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
              />
            </div>
            <div className="form-field">
              <label htmlFor="assignment">Assignment (optional)</label>
              <select
                id="assignment"
                value={assignmentId}
                onChange={(e) => setAssignmentId(e.target.value)}
                style={{
                  padding: "0.8rem 1rem",
                  background: "rgba(255, 255, 255, 0.12)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "10px",
                  color: "var(--light)",
                }}
              >
                <option value="">No assignment selected</option>
                {assignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Practice from selected notes (optional)</label>
              {loadingNotes ? (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem", color: "var(--gray)" }}>
                  <div className="skeleton-shimmer" style={{ width: "14px", height: "14px", borderRadius: "50%", flexShrink: 0 }} aria-hidden="true" />
                  <span style={{ fontSize: "0.85rem" }}>Loading notes…</span>
                </div>
              ) : courseId && notes.length === 0 ? (
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
            <div className="form-field">
              <label htmlFor="mode">Mode</label>
              <select
                id="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                style={{
                  padding: "0.8rem 1rem",
                  background: "rgba(255, 255, 255, 0.12)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "10px",
                  color: "var(--light)",
                }}
              >
                {modeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="contact-submit-btn" disabled={loading}>
              {loading ? "Generating..." : "Generate test"}
            </button>
            {error ? <div className="form-message error" style={{ display: "block" }}>{error}</div> : null}
          </form>
        </div>
      </div>
    </section>
  );
}
