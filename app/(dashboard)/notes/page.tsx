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
  const [file, setFile] = useState<File | null>(null);
  const [unitName, setUnitName] = useState("");
  const [examName, setExamName] = useState("");
  const [topicTags, setTopicTags] = useState("");
  const [autoProcess, setAutoProcess] = useState(true);
  const [canvasFiles, setCanvasFiles] = useState<CanvasFile[]>([]);
  const [canvasFileId, setCanvasFileId] = useState<number | null>(null);
  const [summaryType, setSummaryType] = useState("bullet_points");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [outlineSummary, setOutlineSummary] = useState<string | null>(null);
  const [cheatSheetSummary, setCheatSheetSummary] = useState<string | null>(null);
  const [extractions, setExtractions] = useState<{
    key_concepts: string[];
    formulas: string[];
    definitions: Array<{ term: string; definition: string }>;
    examples: string[];
  } | null>(null);
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [syncingPowerpoints, setSyncingPowerpoints] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [studyGuideStyle, setStudyGuideStyle] = useState("bullet_points");
  const [studyGuideLoading, setStudyGuideLoading] = useState(false);
  const [studyGuideSummary, setStudyGuideSummary] = useState<string | null>(null);
  const [studyGuideError, setStudyGuideError] = useState<string | null>(null);
  const [studyGuideWarning, setStudyGuideWarning] = useState<string | null>(null);
  const [moduleItems, setModuleItems] = useState<ModuleItem[]>([]);
  const [selectedModuleItems, setSelectedModuleItems] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
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
    async function loadCanvasFiles() {
      if (!courseId) {
        setCanvasFiles([]);
        setCanvasFileId(null);
        setSyncMessage(null);
        setModuleItems([]);
        setSelectedModuleItems({});
        setNotes([]);
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
          setSelectedModuleItems({});
          setNotes(notesData ?? []);
        }
      } catch {
        if (mounted) {
          setCanvasFiles([]);
          setCanvasFileId(null);
          setSyncMessage(null);
          setModuleItems([]);
          setSelectedModuleItems({});
          setNotes([]);
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
    setOutlineSummary(null);
    setExtractions(null);
    setCheatSheetSummary(null);

    if (!file) {
      setError("Please choose a file to upload.");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (courseId) formData.append("courseId", courseId);
      if (unitName) formData.append("unitName", unitName);
      if (examName) formData.append("examName", examName);
      if (topicTags) formData.append("topicTags", topicTags);

      const uploadRes = await fetch("/api/notes/upload", {
        method: "POST",
        body: formData,
      });

      const uploadData = (await uploadRes.json()) as UploadResponse;
      if (!uploadRes.ok || !uploadData.success || !uploadData.data?.noteId) {
        setError(uploadData.error || "Upload failed.");
        return;
      }

      if (autoProcess) {
        const [bulletRes, outlineRes, cheatRes, extractRes] = await Promise.all([
          fetch("/api/notes/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              noteId: uploadData.data.noteId,
              summaryType: "bullet_points",
            }),
          }),
          fetch("/api/notes/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              noteId: uploadData.data.noteId,
              summaryType: "outline",
            }),
          }),
          fetch("/api/notes/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              noteId: uploadData.data.noteId,
              summaryType: "detailed",
              customInstruction: "Create a concise cheat sheet with formulas, key facts, and quick recall points.",
            }),
          }),
          fetch("/api/notes/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ noteId: uploadData.data.noteId }),
          }),
        ]);

        const bulletData = await bulletRes.json();
        const outlineData = await outlineRes.json();
        const cheatData = await cheatRes.json();
        const extractData = await extractRes.json();
        if (!bulletRes.ok || bulletData?.success === false) {
          setError(bulletData?.error || "Summary failed.");
          return;
        }
        if (!outlineRes.ok || outlineData?.success === false) {
          setError(outlineData?.error || "Outline failed.");
          return;
        }
        if (!cheatRes.ok || cheatData?.success === false) {
          setError(cheatData?.error || "Cheat sheet failed.");
          return;
        }
        if (extractRes.ok && extractData?.success !== false) {
          setExtractions(extractData?.extraction ?? null);
        }
        setSummary(bulletData?.summary?.content || "Summary generated.");
        setOutlineSummary(outlineData?.summary?.content || "Outline generated.");
        setCheatSheetSummary(cheatData?.summary?.content || "Cheat sheet generated.");
      } else {
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
      }

      if (courseId) {
        const notesRes = await fetch(`/api/notes/list?courseId=${courseId}`);
        const notesData = await notesRes.json();
        if (notesRes.ok) setNotes(notesData ?? []);
      }
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
    setOutlineSummary(null);
    setExtractions(null);

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

      if (courseId) {
        const notesRes = await fetch(`/api/notes/list?courseId=${courseId}`);
        const notesData = await notesRes.json();
        if (notesRes.ok) setNotes(notesData ?? []);
      }
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
              <label htmlFor="unitName">Unit</label>
              <input
                id="unitName"
                type="text"
                placeholder="e.g. Unit 3: Industrial Revolution"
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="examName">Exam</label>
              <input
                id="examName"
                type="text"
                placeholder="e.g. Midterm, Unit 3 Quiz"
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="topicTags">Topics (comma separated)</label>
              <input
                id="topicTags"
                type="text"
                placeholder="e.g. imperialism, railroads, urbanization"
                value={topicTags}
                onChange={(e) => setTopicTags(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="file">Upload file</label>
              <input
                id="file"
                type="file"
                accept=".pdf,.docx,.pptx,.txt,.md,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.mp3,.wav,.m4a"
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
            <div className="form-field" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <input
                id="autoProcess"
                type="checkbox"
                checked={autoProcess}
                onChange={(e) => setAutoProcess(e.target.checked)}
              />
              <label htmlFor="autoProcess" style={{ margin: 0 }}>
                Auto-generate bullet summary, outline, and key concepts
              </label>
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
          <h3 className="contact-info-title">Bullet Summary</h3>
          <p style={{ color: "var(--light)", whiteSpace: "pre-wrap" }}>{summary}</p>
        </div>
      ) : null}

      {outlineSummary ? (
        <div className="contact-info-section animate-on-scroll" style={{ marginTop: "1.5rem" }}>
          <h3 className="contact-info-title">Outline</h3>
          <p style={{ color: "var(--light)", whiteSpace: "pre-wrap" }}>{outlineSummary}</p>
        </div>
      ) : null}

      {cheatSheetSummary ? (
        <div className="contact-info-section animate-on-scroll" style={{ marginTop: "1.5rem" }}>
          <h3 className="contact-info-title">Cheat Sheet</h3>
          <p style={{ color: "var(--light)", whiteSpace: "pre-wrap" }}>{cheatSheetSummary}</p>
        </div>
      ) : null}

      {extractions ? (
        <div className="contact-info-section animate-on-scroll" style={{ marginTop: "1.5rem" }}>
          <h3 className="contact-info-title">Key Concepts & Examples</h3>
          <div style={{ color: "var(--light)" }}>
            {extractions.key_concepts.length > 0 ? (
              <>
                <strong>Key concepts</strong>
                <ul>
                  {extractions.key_concepts.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {extractions.formulas.length > 0 ? (
              <>
                <strong>Formulas</strong>
                <ul>
                  {extractions.formulas.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {extractions.definitions.length > 0 ? (
              <>
                <strong>Definitions</strong>
                <ul>
                  {extractions.definitions.map((item) => (
                    <li key={item.term}>
                      <strong>{item.term}:</strong> {item.definition}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {extractions.examples.length > 0 ? (
              <>
                <strong>Examples</strong>
                <ul>
                  {extractions.examples.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
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
            <p style={{ color: "var(--gray)" }}>No notes yet. Upload or import to get started.</p>
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
