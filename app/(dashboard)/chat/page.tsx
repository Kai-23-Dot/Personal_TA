"use client";

import { useEffect, useMemo, useState } from "react";
import { useChat } from "ai/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRouter } from "next/navigation";

type Course = { id: string; name: string };
type Note = { id: string; title: string };
type Assignment = { id: string; title: string };

export default function ChatPage() {
  const router = useRouter();
  const sessionId = useMemo(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return String(Date.now());
  }, []);

  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [noteId, setNoteId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");

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
    async function load() {
      if (!courseId) {
        setNotes([]);
        setAssignments([]);
        setNoteId("");
        setAssignmentId("");
        return;
      }
      const [notesRes, assignmentsRes] = await Promise.all([
        fetch(`/api/notes/list?courseId=${courseId}`),
        fetch(`/api/assignments?course_id=${courseId}`),
      ]);
      const notesData = notesRes.ok ? await notesRes.json() : [];
      const assignmentsData = assignmentsRes.ok ? await assignmentsRes.json() : [];
      if (mounted) {
        setNotes(notesData ?? []);
        setAssignments(assignmentsData ?? []);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [courseId]);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/chat",
    body: { sessionId, noteId, assignmentId },
  });

  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === "assistant");
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");

  async function handleSaveAsNote() {
    if (!lastAssistantMessage) return;
    await fetch("/api/notes/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: lastUserMessage ? `Chat: ${String(lastUserMessage.content).slice(0, 40)}` : "Chat explanation",
        content: String(lastAssistantMessage.content),
        courseId: courseId || null,
      }),
    });
  }

  async function handleTurnIntoQuiz() {
    if (!lastUserMessage || !courseId) return;
    const res = await fetch("/api/practice/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: String(lastUserMessage.content).slice(0, 120),
        courseId,
        difficulty: "adaptive",
        questionCount: 8,
      }),
    });
    const data = await res.json();
    if (data?.sessionId) {
      router.push(`/practice/session?sessionId=${data.sessionId}`);
    }
  }

  async function handleSaveAsFlashcard() {
    if (!lastAssistantMessage) return;
    const front = lastUserMessage ? String(lastUserMessage.content).slice(0, 200) : "Chat concept";
    const back = String(lastAssistantMessage.content).slice(0, 1200);
    await fetch("/api/flashcards/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        front,
        back,
        courseId: courseId || null,
        topic: courseId ? courses.find((c) => c.id === courseId)?.name ?? "General" : "General",
      }),
    });
  }

  return (
    <section className="section">
      <h2 className="animate-on-scroll">TA Chat</h2>
      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Ask PersonalTA anything</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minHeight: "320px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {messages.length === 0 ? (
                <p style={{ color: "var(--gray)" }}>Ask a question about your notes, assignments, or upcoming tests.</p>
              ) : null}
              {messages.map((message) => (
                <div key={message.id} style={{
                  alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "80%",
                  background: message.role === "user" ? "rgba(0, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.08)",
                  padding: "0.8rem 1rem",
                  borderRadius: "12px",
                  color: "var(--light)",
                }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                </div>
              ))}
            </div>
            <form className="contact-form" onSubmit={handleSubmit}>
              <div className="form-field">
                <label htmlFor="chat">Your question</label>
                <textarea
                  id="chat"
                  placeholder="Explain photosynthesis from my notes..."
                  value={input}
                  onChange={handleInputChange}
                  rows={4}
                />
              </div>
              <div className="form-field">
                <label htmlFor="courseSelect">Course (for saving/quiz)</label>
                <select
                  id="courseSelect"
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  style={{
                    padding: "0.8rem 1rem",
                    background: "rgba(255, 255, 255, 0.12)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "10px",
                    color: "var(--light)",
                  }}
                >
                  <option value="">No course selected</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="noteSelect">Reference note (optional)</label>
                <select
                  id="noteSelect"
                  value={noteId}
                  onChange={(e) => setNoteId(e.target.value)}
                >
                  <option value="">No note selected</option>
                  {notes.map((note) => (
                    <option key={note.id} value={note.id}>{note.title}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="assignmentSelect">Reference assignment (optional)</label>
                <select
                  id="assignmentSelect"
                  value={assignmentId}
                  onChange={(e) => setAssignmentId(e.target.value)}
                >
                  <option value="">No assignment selected</option>
                  {assignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>{assignment.title}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="contact-submit-btn" disabled={isLoading}>
                {isLoading ? "Thinking..." : "Send"}
              </button>
              {lastAssistantMessage ? (
                <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
                  <button type="button" className="btn btn-secondary" onClick={handleSaveAsNote}>
                    Save as Note
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={handleSaveAsFlashcard}>
                    Save as Flashcard
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleTurnIntoQuiz}
                    disabled={!courseId}
                  >
                    Turn into Quiz
                  </button>
                </div>
              ) : null}
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
