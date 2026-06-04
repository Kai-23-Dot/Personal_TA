"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useChat } from "ai/react";

type Assignment = {
  id: string;
  title: string;
  description: string | null;
  assignment_type: string;
  due_date: string | null;
  course?: { name: string } | null;
  course_id: string | null;
};

type Course = {
  id: string;
  name: string;
  color: string | null;
};

export default function AssignmentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCourseId = searchParams.get("course_id") ?? searchParams.get("courseId");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null);
  const [helperPrompt, setHelperPrompt] = useState("");

  const sessionId = useMemo(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return String(Date.now());
  }, []);

  const helperContext = useMemo(() => {
    if (!activeAssignment) return "";
    const mode =
      activeAssignment.assignment_type === "quiz" || activeAssignment.assignment_type === "test" || activeAssignment.assignment_type === "exam"
        ? "multiple-choice or quiz-style assessment"
        : "written/typing assignment";
    return [
      `Assignment: ${activeAssignment.title}`,
      `Course: ${activeAssignment.course?.name ?? "Unknown"}`,
      `Type: ${activeAssignment.assignment_type} (${mode})`,
      `Description: ${activeAssignment.description ?? "No description available."}`,
      "Safety rule: Do not provide direct graded answers. Provide step-by-step guidance, hints, concept explanations, and review strategy.",
    ].join("\n");
  }, [activeAssignment]);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/chat/context",
    body: { sessionId, context: helperContext },
  });

  useEffect(() => {
    let mounted = true;
    setLoadingAssignments(true);
    setAssignmentsError(null);
    const assignmentUrl = selectedCourseId
      ? `/api/assignments?course_id=${encodeURIComponent(selectedCourseId)}`
      : "/api/assignments";

    Promise.all([
      fetch(assignmentUrl).then(async (res) => {
        const data = await res.json().catch(() => []);
        if (!res.ok) {
          throw new Error((data && typeof data === "object" && "error" in data) ? String((data as { error?: string }).error) : "Failed to load assignments");
        }
        return Array.isArray(data) ? data : [];
      }),
      fetch("/api/courses").then(async (res) => {
        const data = await res.json().catch(() => []);
        return res.ok && Array.isArray(data) ? data : [];
      }),
    ])
      .then(([assignmentData, courseData]) => {
        if (!mounted) return;
        setAssignments(assignmentData);
        setCourses(courseData);
      })
      .catch((err) => {
        if (mounted) {
          setAssignments([]);
          setAssignmentsError(err instanceof Error ? err.message : "Failed to load assignments");
        }
      })
      .finally(() => {
        if (mounted) setLoadingAssignments(false);
      });
    return () => {
      mounted = false;
    };
  }, [selectedCourseId]);

  useEffect(() => {
    if (!selectedCourseId) return;
    setSummary(null);
    setHelperOpen(false);
    setActiveAssignment(null);
  }, [selectedCourseId]);

  /*
   * Keep a second, client-side guard even though the API does the real filtering.
   * This prevents stale responses from a previous course request from flashing
   * under the wrong subject if the user switches quickly.
   */
  const visibleAssignments = useMemo(() => {
    if (!selectedCourseId) return assignments;
    return assignments.filter((assignment) => assignment.course_id === selectedCourseId);
  }, [assignments, selectedCourseId]);

  const selectedCourse = useMemo(() => {
    if (!selectedCourseId) return null;
    return courses.find((course) => course.id === selectedCourseId) ?? null;
  }, [courses, selectedCourseId]);

  const filterLabel = selectedCourse?.name ?? (selectedCourseId ? "Selected course" : "All courses");

  async function handleSummary(assignmentId: string) {
    setLoading(true);
    setSummary(null);
    const res = await fetch("/api/assignments/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId }),
    });
    const data = await res.json();
    if (res.ok) setSummary(data?.summary ?? null);
    setLoading(false);
  }

  async function handleQuiz(assignment: Assignment) {
    const res = await fetch("/api/practice/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: assignment.title,
        courseId: assignment.course_id,
        difficulty: "adaptive",
        questionCount: 8,
        assignmentId: assignment.id,
      }),
    });
    const data = await res.json();
    if (data?.sessionId) router.push(`/practice/session?sessionId=${data.sessionId}`);
  }

  function openHelperForAssignment(assignment: Assignment) {
    setActiveAssignment(assignment);
    const isQuizLike = ["quiz", "test", "exam"].includes(assignment.assignment_type);
    setHelperPrompt(
      isQuizLike
        ? "Help me review this quiz topic with hints and elimination strategy."
        : "Help me outline and improve my response for this writing assignment."
    );
    setHelperOpen(true);
  }

  return (
    <section className="section">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 inline-flex items-center rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100">
            {selectedCourseId ? "Filtered by course" : "All synced coursework"}
          </p>
          <h2 className="animate-on-scroll">Assignments</h2>
          <p className="mt-1 text-sm text-slate-400">
            Showing {selectedCourseId ? `assignments for ${filterLabel}` : "assignments from every synced course"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/assignments" className="btn btn-secondary">All assignments</Link>
          {selectedCourseId ? <Link href="/courses" className="btn btn-primary">Back to courses</Link> : null}
        </div>
      </div>

      {courses.length > 0 ? (
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          <Link
            href="/assignments"
            className={`rounded-full border px-3 py-1.5 text-sm transition ${!selectedCourseId ? "border-emerald-300/45 bg-emerald-400/15 text-emerald-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
          >
            All
          </Link>
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/assignments?course_id=${course.id}`}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${selectedCourseId === course.id ? "border-emerald-300/45 bg-emerald-400/15 text-emerald-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
            >
              {course.name}
            </Link>
          ))}
        </div>
      ) : null}

      {loadingAssignments ? (
        <p style={{ color: "var(--gray)" }}>Loading assignments...</p>
      ) : assignmentsError ? (
        <p style={{ color: "#fda4af" }}>{assignmentsError}</p>
      ) : visibleAssignments.length === 0 ? (
        <p style={{ color: "var(--gray)" }}>
          {selectedCourseId ? `No assignments found for ${filterLabel}.` : "No assignments synced yet."}
        </p>
      ) : (
        <div className="timeline">
          {visibleAssignments.map((assignment) => (
            <div key={assignment.id} className="timeline-item animate-on-scroll">
              <div className="timeline-header">
                <div className="timeline-time">
                  {assignment.due_date ? new Date(assignment.due_date).toLocaleDateString() : "TBD"}
                </div>
                <div className="timeline-info">
                  <div className="timeline-title">{assignment.title}</div>
                  <div className="timeline-speaker">{assignment.course?.name ?? "Course"}</div>
                </div>
                <div className="timeline-collapse-icon">▼</div>
              </div>
              <div className="timeline-details">
                <div className="timeline-desc">
                  {assignment.description ?? "No description"}
                </div>
                <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
                  <button className="btn btn-secondary" onClick={() => handleSummary(assignment.id)} disabled={loading}>
                    {loading ? "Generating..." : "Summary"}
                  </button>
                  <button className="btn btn-secondary" onClick={() => handleQuiz(assignment)}>
                    Generate Quiz
                  </button>
                  <button className="btn btn-secondary" onClick={() => openHelperForAssignment(assignment)}>
                    {["quiz", "test", "exam"].includes(assignment.assignment_type) ? "Quiz Helper" : "Writing Helper"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {summary ? (
        <div className="contact-info-section animate-on-scroll" style={{ marginTop: "2rem" }}>
          <h3 className="contact-info-title">Assignment Summary</h3>
          <p style={{ color: "var(--light)", whiteSpace: "pre-wrap" }}>{summary}</p>
        </div>
      ) : null}

      {helperOpen ? (
        <aside
          aria-label="Assignment helper"
          style={{
            position: "fixed",
            left: "1.25rem",
            bottom: "1.25rem",
            width: "min(420px, calc(100vw - 2rem))",
            zIndex: 1200,
            borderRadius: "16px",
            border: "1px solid rgba(148,163,184,0.25)",
            background: "rgba(10, 16, 28, 0.96)",
            boxShadow: "0 24px 56px rgba(2, 8, 20, 0.6)",
            padding: "0.9rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
            <strong style={{ color: "#e6edf8" }}>
              {activeAssignment ? `Helper: ${activeAssignment.title}` : "Assignment Helper"}
            </strong>
            <button type="button" className="btn btn-secondary" onClick={() => setHelperOpen(false)}>
              Close
            </button>
          </div>
          <p style={{ color: "#9aa8bf", fontSize: "0.85rem", marginBottom: "0.6rem" }}>
            {activeAssignment && ["quiz", "test", "exam"].includes(activeAssignment.assignment_type)
              ? "Mode: Quiz support (concept hints, elimination strategy, review guidance)."
              : "Mode: Writing support (outline, thesis, clarity, rubric alignment)."}
          </p>
          <div style={{ maxHeight: "240px", overflowY: "auto", display: "grid", gap: "0.5rem", marginBottom: "0.6rem" }}>
            {messages.length === 0 ? (
              <p style={{ color: "#9aa8bf", margin: 0 }}>Ask for help with this assignment without requesting final answers.</p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: msg.role === "user" ? "end" : "start",
                    background: msg.role === "user" ? "rgba(34, 211, 238, 0.16)" : "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(148,163,184,0.18)",
                    borderRadius: "10px",
                    padding: "0.55rem 0.7rem",
                    color: "#e6edf8",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}
                </div>
              ))
            )}
            {isLoading ? <p style={{ color: "#9aa8bf", margin: 0 }}>Thinking...</p> : null}
          </div>
          <form
            onSubmit={handleSubmit}
            style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.5rem" }}
          >
            <input
              value={input}
              onChange={handleInputChange}
              placeholder={helperPrompt || "Ask for guidance..."}
              style={{
                borderRadius: "10px",
                border: "1px solid rgba(148,163,184,0.25)",
                background: "rgba(148,163,184,0.12)",
                color: "#e6edf8",
                padding: "0.6rem 0.75rem",
              }}
            />
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              Send
            </button>
          </form>
        </aside>
      ) : null}
    </section>
  );
}
