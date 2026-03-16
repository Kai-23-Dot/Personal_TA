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

type UploadResponse = {
  success: boolean;
  data?: { noteId: string; title: string };
  error?: string;
};

type CanvasFile = {
  id: number;
  display_name: string;
  filename: string;
  content_type: string;
  size: number;
  updated_at: string;
};

type NoteListItem = {
  id: string;
  title: string;
  updated_at: string;
};

export default function NotesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [canvasFiles, setCanvasFiles] = useState<CanvasFile[]>([]);
  const [canvasFileId, setCanvasFileId] = useState<number | null>(null);
  const [summaryType, setSummaryType] = useState("bullet_points");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [selectedNotes, setSelectedNotes] = useState<Record<string, boolean>>({});
  const [syncingPowerpoints, setSyncingPowerpoints] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [studyGuideStyle, setStudyGuideStyle] = useState("bullet_points");
  const [studyGuideLoading, setStudyGuideLoading] = useState(false);
  const [studyGuideSummary, setStudyGuideSummary] = useState<string | null>(null);
  const [studyGuideError, setStudyGuideError] = useState<string | null>(null);
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
    async function loadCanvasFiles() {
      if (!courseId) {
        setCanvasFiles([]);
        setCanvasFileId(null);
        setNotes([]);
        setSelectedNotes({});
        setSyncMessage(null);
        return;
      }
      try {
        const [filesRes, notesRes] = await Promise.all([
          fetch(`/api/canvas/files?courseId=${courseId}`),
          fetch(`/api/notes/list?courseId=${courseId}`),
        ]);
        const filesData = await filesRes.json();
        const notesData = await notesRes.json();
        if (!filesRes.ok) throw new Error(filesData?.error || "Failed to load Canvas files");
        if (!notesRes.ok) throw new Error(notesData?.error || "Failed to load notes");
        if (mounted) {
          const sorted = [...(filesData ?? [])].sort((a, b) => {
            const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
            const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
            return bTime - aTime;
          });
          setCanvasFiles(sorted);
          setCanvasFileId(null);
          setNotes(notesData ?? []);
          setSelectedNotes({});
        }
      } catch {
        if (mounted) {
          setCanvasFiles([]);
          setCanvasFileId(null);
          setNotes([]);
          setSelectedNotes({});
          setSyncMessage(null);
        }
      }
    }
    loadCanvasFiles();
    return () => {
      mounted = false;
    };
  }, [courseId]);

  useEffect(() => {
    let mounted = true;
    async function syncPowerpoints() {
      if (!courseId) return;
      setSyncingPowerpoints(true);
      setSyncMessage(null);
      try {
        const res = await fetch("/api/notes/sync-canvas-powerpoints", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId, maxFiles: 20 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "PowerPoint sync failed");
        if (!mounted) return;
        if (data?.imported > 0) {
          setSyncMessage(`Imported ${data.imported} PowerPoint${data.imported === 1 ? "" : "s"} from Canvas.`);
        } else {
          setSyncMessage("PowerPoint notes are already up to date.");
        }
        const notesRes = await fetch(`/api/notes/list?courseId=${courseId}`);
        const notesData = await notesRes.json();
        if (notesRes.ok && mounted) {
          setNotes(notesData ?? []);
          setSelectedNotes({});
        }
      } catch (err) {
        if (mounted) setSyncMessage((err as Error).message);
      } finally {
        if (mounted) setSyncingPowerpoints(false);
      }
    }
    syncPowerpoints();
    return () => {
      mounted = false;
    };
  }, [courseId]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSummary(null);

    if (!file) {
      setError("Please choose a file to upload.");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (courseId) formData.append("courseId", courseId);

      const uploadRes = await fetch("/api/notes/upload", {
        method: "POST",
        body: formData,
      });

      const uploadData = (await uploadRes.json()) as UploadResponse;
      if (!uploadRes.ok || !uploadData.success || !uploadData.data?.noteId) {
        setError(uploadData.error || "Upload failed.");
        return;
      }

      const summaryRes = await fetch("/api/notes/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteId: uploadData.data.noteId,
          summaryType,
        }),
      });

      const summaryData = await summaryRes.json();
      if (!summaryRes.ok || summaryData?.success === false) {
        setError(summaryData?.error || "Summary failed.");
        return;
      }

      setSummary(summaryData?.summary?.content || "Summary generated.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleImportCanvasFile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSummary(null);

    if (!courseId || !canvasFileId) {
      setError("Select a course and a PowerPoint file.");
      return;
    }

    setImporting(true);
    try {
      const importRes = await fetch("/api/notes/import-canvas-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, fileId: canvasFileId }),
      });

      const importData = await importRes.json();
      if (!importRes.ok || importData?.error) {
        setError(importData?.error || "Import failed.");
        return;
      }

      const summaryRes = await fetch("/api/notes/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteId: importData.noteId,
          summaryType,
        }),
      });

      const summaryData = await summaryRes.json();
      if (!summaryRes.ok || summaryData?.success === false) {
        setError(summaryData?.error || "Summary failed.");
        return;
      }

      setSummary(summaryData?.summary?.content || "Summary generated.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function handleStudyGuide(e: React.FormEvent) {
    e.preventDefault();
    setStudyGuideError(null);
    setStudyGuideSummary(null);

    const noteIds = Object.entries(selectedNotes)
      .filter(([, selected]) => selected)
      .map(([id]) => id);

    if (!courseId) {
      setStudyGuideError("Select a course for the study guide.");
      return;
    }

    if (noteIds.length === 0) {
      setStudyGuideError("Select at least one note to build a study guide.");
      return;
    }

    setStudyGuideLoading(true);
    try {
      const res = await fetch("/api/notes/study-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteIds, summaryStyle: studyGuideStyle }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        setStudyGuideError(data?.error || "Study guide failed.");
        return;
      }
      setStudyGuideSummary(data?.summary || "Study guide generated.");
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
          <h3 className="contact-form-title">Upload notes to summarize</h3>
          <form className="contact-form" onSubmit={handleUpload}>
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
            <div className="form-field">
              <label htmlFor="file">Upload file</label>
              <input
                id="file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="summaryType">Summary style</label>
              <select
                id="summaryType"
                value={summaryType}
                onChange={(e) => setSummaryType(e.target.value)}
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
            <button type="submit" className="contact-submit-btn" disabled={loading}>
              {loading ? "Processing..." : "Upload & Summarize"}
            </button>
            {error ? <div className="form-message error" style={{ display: "block" }}>{error}</div> : null}
          </form>
        </div>
      </div>

      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "2rem auto 0" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Import a Canvas PowerPoint</h3>
          {syncMessage ? (
            <p style={{ color: "var(--gray)", marginBottom: "0.8rem" }}>{syncMessage}</p>
          ) : null}
          <form className="contact-form" onSubmit={handleImportCanvasFile}>
            <div className="form-field">
              <label htmlFor="canvasCourse">Course</label>
              <select
                id="canvasCourse"
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
              <label htmlFor="canvasFile">PowerPoint file</label>
              <select
                id="canvasFile"
                value={canvasFileId ?? ""}
                onChange={(e) => setCanvasFileId(e.target.value ? Number(e.target.value) : null)}
                style={{
                  padding: "0.8rem 1rem",
                  background: "rgba(255, 255, 255, 0.12)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "10px",
                  color: "var(--light)",
                }}
              >
                <option value="">Select a PowerPoint</option>
                {canvasFiles.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.display_name || file.filename}
                  </option>
                ))}
              </select>
              {courseId && canvasFiles.length === 0 ? (
                <p style={{ color: "var(--gray)", marginTop: "0.5rem" }}>
                  No PowerPoint files found for this course in Canvas.
                </p>
              ) : null}
            </div>
            <button type="submit" className="contact-submit-btn" disabled={importing}>
              {importing ? "Importing..." : "Import & Summarize"}
            </button>
            {syncingPowerpoints ? (
              <p style={{ color: "var(--gray)", marginTop: "0.6rem" }}>
                Scanning recent PowerPoints from Canvas...
              </p>
            ) : null}
          </form>
        </div>
      </div>

      {summary ? (
        <div className="contact-info-section animate-on-scroll" style={{ marginTop: "2rem" }}>
          <h3 className="contact-info-title">Summary</h3>
          <p style={{ color: "var(--light)", whiteSpace: "pre-wrap" }}>{summary}</p>
        </div>
      ) : null}

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
              <label>Notes to include</label>
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
                    maxHeight: "260px",
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
          </form>
        </div>
      </div>

      {studyGuideSummary ? (
        <div className="contact-info-section animate-on-scroll" style={{ marginTop: "2rem" }}>
          <h3 className="contact-info-title">Study Guide</h3>
          <p style={{ color: "var(--light)", whiteSpace: "pre-wrap" }}>{studyGuideSummary}</p>
        </div>
      ) : null}
    </section>
  );
}
