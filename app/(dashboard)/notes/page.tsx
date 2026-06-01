"use client";

import { useEffect, useState } from "react";

const summaryOptions = [
  { value: "bullet_points", label: "Bullet points" },
  { value: "outline", label: "Outline" },
  { value: "detailed", label: "Detailed" },
];

type Course = {
  id: string;
  name: string;
};

type NoteListItem = {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
  course_id: string | null;
  unit_name: string | null;
  exam_name: string | null;
  topic_tags: string[];
  file_name: string | null;
  file_type: string | null;
};

type ModuleItem = {
  moduleId: number;
  moduleName: string;
  itemId: number;
  title: string;
  type: string;
  page_url: string | null;
  external_url: string | null;
  content_id: number | null;
  content_details: { "content-type"?: string; url?: string } | null;
};

export default function NotesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [studyGuideStyle, setStudyGuideStyle] = useState("bullet_points");
  const [studyGuideLoading, setStudyGuideLoading] = useState(false);
  const [studyGuideSummary, setStudyGuideSummary] = useState<string | null>(null);
  const [studyGuideError, setStudyGuideError] = useState<string | null>(null);
  const [studyGuideWarning, setStudyGuideWarning] = useState<string | null>(null);
  const [moduleItems, setModuleItems] = useState<ModuleItem[]>([]);
  const [selectedModuleItems, setSelectedModuleItems] = useState<Record<number, boolean>>({});
  const [filterText, setFilterText] = useState("");

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
    async function loadCourseNotes() {
      if (!courseId) {
        setModuleItems([]);
        setSelectedModuleItems({});
        setNotes([]);
        return;
      }
      try {
        const notesRes = await fetch(`/api/notes/list?courseId=${courseId}`);
        const notesData = await notesRes.json();
        if (!notesRes.ok) throw new Error(notesData?.error || "Failed to load notes");
        if (mounted) {
          setSelectedModuleItems({});
          setNotes(notesData ?? []);
        }
      } catch {
        if (mounted) {
          setModuleItems([]);
          setSelectedModuleItems({});
          setNotes([]);
        }
      }
    }
    loadCourseNotes();
    return () => {
      mounted = false;
    };
  }, [courseId]);

  useEffect(() => {
    let mounted = true;
    async function loadModuleItems() {
      if (!courseId) return;
      try {
        const res = await fetch(`/api/canvas/module-items?courseId=${courseId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load Canvas module items");
        if (mounted) {
          setModuleItems(data ?? []);
          setSelectedModuleItems({});
        }
      } catch {
        if (mounted) {
          setModuleItems([]);
          setSelectedModuleItems({});
        }
      }
    }
    loadModuleItems();
    return () => {
      mounted = false;
    };
  }, [courseId]);

  async function handleStudyGuide(e: React.FormEvent) {
    e.preventDefault();
    setStudyGuideError(null);
    setStudyGuideSummary(null);
    setStudyGuideWarning(null);

    const selectedItems = Object.entries(selectedModuleItems)
      .filter(([, selected]) => selected)
      .map(([id]) => Number(id))
      .filter((id) => !Number.isNaN(id));

    if (!courseId) {
      setStudyGuideError("Select a course for the study guide.");
      return;
    }

    if (selectedItems.length === 0) {
      setStudyGuideError("Select at least one lesson content to build a study guide.");
      return;
    }

    setStudyGuideLoading(true);
    try {
      const res = await fetch("/api/notes/study-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonItemIds: selectedItems,
          summaryStyle: studyGuideStyle,
          courseId,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        setStudyGuideError(data?.error || "Study guide failed.");
        return;
      }
      setStudyGuideSummary(data?.summary || "Study guide generated.");
      if (selectedItems.length > 0 && !data?.lessonContentIncluded) {
        setStudyGuideWarning(
          "Lesson slides could not be accessed. If the Google Slides link is private, publish or share it, or attach the PPTX file in Canvas."
        );
      }
    } catch (err) {
      setStudyGuideError((err as Error).message);
    } finally {
      setStudyGuideLoading(false);
    }
  }

  return (
    <section className="section">
      <h2 className="animate-on-scroll">Notes Summary</h2>
      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Canvas-synced notes</h3>
          <form className="contact-form">
            <div className="form-field">
              <label htmlFor="course">Course</label>
              <select
                id="course"
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
            <p style={{ color: "var(--gray)" }}>
              Notes are automatically pulled from Canvas modules and attached files.
            </p>
          </form>
        </div>
      </div>

      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "2rem auto 0" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Build a study guide</h3>
          <form className="contact-form" onSubmit={handleStudyGuide}>
            <div className="form-field">
              <label htmlFor="studyGuideCourse">Course</label>
              <select
                id="studyGuideCourse"
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
                <option value="">Select a course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Lesson content to include (Canvas modules)</label>
              {courseId && moduleItems.length === 0 ? (
                <p style={{ color: "var(--gray)", marginTop: "0.5rem" }}>
                  No module items found yet. Sync Canvas to load modules.
                </p>
              ) : null}
              {moduleItems.length > 0 ? (
                <div
                  style={{
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: "12px",
                    padding: "0.8rem",
                    maxHeight: "260px",
                    overflowY: "auto",
                    background: "rgba(9, 14, 24, 0.6)",
                  }}
                >
                  {moduleItems.map((item) => (
                    <label
                      key={item.itemId}
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
                        checked={Boolean(selectedModuleItems[item.itemId])}
                        onChange={(e) =>
                          setSelectedModuleItems((prev) => ({ ...prev, [item.itemId]: e.target.checked }))
                        }
                      />
                      <span>{item.moduleName} — {item.title}</span>
                    </label>
                  ))}
                </div>
              ) : null}
              {moduleItems.length > 0 ? (
                <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.8rem" }}>
                  <button
                    type="button"
                    className="contact-submit-btn"
                    style={{ width: "auto", padding: "0.55rem 1.4rem" }}
                    onClick={() => {
                      const next: Record<number, boolean> = {};
                      moduleItems.forEach((item) => {
                        next[item.itemId] = true;
                      });
                      setSelectedModuleItems(next);
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
                    onClick={() => setSelectedModuleItems({})}
                  >
                    Clear
                  </button>
                </div>
              ) : null}
              {Object.values(selectedModuleItems).some(Boolean) ? (
                <p style={{ color: "var(--gray)", marginTop: "0.5rem" }}>
                  We will pull Google Slides or PowerPoint content linked to these lessons (if accessible).
                </p>
              ) : null}
            </div>
            <div className="form-field">
              <label htmlFor="studyGuideStyle">Study guide style</label>
              <select
                id="studyGuideStyle"
                value={studyGuideStyle}
                onChange={(e) => setStudyGuideStyle(e.target.value)}
                style={{
                  padding: "0.8rem 1rem",
                  background: "rgba(255, 255, 255, 0.12)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "10px",
                  color: "var(--light)",
                }}
              >
                {summaryOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="contact-submit-btn" disabled={studyGuideLoading}>
              {studyGuideLoading ? "Generating..." : "Generate Study Guide"}
            </button>
            {studyGuideError ? (
              <div className="form-message error" style={{ display: "block" }}>
                {studyGuideError}
              </div>
            ) : null}
            {studyGuideWarning ? (
              <div className="form-message" style={{ display: "block", color: "#ffd166" }}>
                {studyGuideWarning}
              </div>
            ) : null}
          </form>
        </div>
      </div>

      {studyGuideSummary ? (
        <div className="contact-info-section animate-on-scroll" style={{ marginTop: "2rem" }}>
          <h3 className="contact-info-title">Study Guide</h3>
          <p style={{ color: "var(--light)", whiteSpace: "pre-wrap" }}>{studyGuideSummary}</p>
        </div>
      ) : null}

      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "2rem auto 0" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">My Notes</h3>
          <div className="form-field">
            <label htmlFor="filterNotes">Filter by unit/exam/topic</label>
            <input
              id="filterNotes"
              type="text"
              placeholder="Type to filter..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
          </div>
          {notes.length === 0 ? (
            <p style={{ color: "var(--gray)" }}>No notes synced yet for this course.</p>
          ) : (
            <div style={{ display: "grid", gap: "0.8rem" }}>
              {notes
                .filter((note) => {
                  const query = filterText.toLowerCase();
                  if (!query) return true;
                  return (
                    note.title.toLowerCase().includes(query) ||
                    (note.unit_name ?? "").toLowerCase().includes(query) ||
                    (note.exam_name ?? "").toLowerCase().includes(query) ||
                    (note.topic_tags ?? []).join(" ").toLowerCase().includes(query)
                  );
                })
                .map((note) => (
                <div
                  key={note.id}
                  style={{
                    padding: "0.9rem 1rem",
                    borderRadius: "12px",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    background: "rgba(9, 14, 24, 0.5)",
                  }}
                >
                  <strong style={{ color: "var(--light)" }}>{note.title}</strong>
                  <div style={{ color: "var(--gray)", marginTop: "0.35rem", fontSize: "0.9rem" }}>
                    {note.unit_name ? `Unit: ${note.unit_name} · ` : ""}
                    {note.exam_name ? `Exam: ${note.exam_name} · ` : ""}
                    {note.file_type ? `Type: ${note.file_type} · ` : ""}
                    {new Date(note.updated_at).toLocaleDateString()}
                  </div>
                  {note.topic_tags?.length ? (
                    <div style={{ color: "var(--gray)", marginTop: "0.4rem", fontSize: "0.85rem" }}>
                      Topics: {note.topic_tags.join(", ")}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
