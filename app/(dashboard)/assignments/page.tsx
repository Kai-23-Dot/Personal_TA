"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

export default function AssignmentsPage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
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
    fetch("/api/assignments")
      .then(async (res) => {
        const data = await res.json().catch(() => []);
        if (!res.ok) {
          throw new Error((data && typeof data === "object" && "error" in data) ? String((data as { error?: string }).error) : "Failed to load assignments");
        }
        return data;
      })
      .then((data) => {
        if (mounted) setAssignments(Array.isArray(data) ? data : []);
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
  }, []);

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
      <h2 className="animate-on-scroll">Assignments</h2>
      {loadingAssignments ? (
        <p style={{ color: "var(--gray)" }}>Loading assignments...</p>
      ) : assignmentsError ? (
        <p style={{ color: "#fda4af" }}>{assignmentsError}</p>
      ) : assignments.length === 0 ? (
        <p style={{ color: "var(--gray)" }}>No assignments synced yet.</p>
      ) : (
        <div className="timeline">
          {assignments.map((assignment) => (
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
