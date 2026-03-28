"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch("/api/assignments")
      .then((res) => res.json())
      .then((data) => {
        if (mounted) setAssignments(data ?? []);
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

  return (
    <section className="section">
      <h2 className="animate-on-scroll">Assignments</h2>
      {assignments.length === 0 ? (
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
    </section>
  );
}
