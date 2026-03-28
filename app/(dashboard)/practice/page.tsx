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
              {loading ? "Generating..." : "Generate Test"}
            </button>
            {error ? <div className="form-message error" style={{ display: "block" }}>{error}</div> : null}
          </form>
        </div>
      </div>
    </section>
  );
}
