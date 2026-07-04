"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, ChevronDown, X } from "lucide-react";
import { usePersistentState, clearPersistentState } from "@/frontend/hooks/usePersistentState";

type SavedGuide = {
  id: string;
  title: string;
  courseName: string;
  style: string;
  content: string;
  savedAt: string;
};

const STORAGE_KEY = "conlearn_study_guides";

function loadSavedGuides(): SavedGuide[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function persistGuide(guide: SavedGuide) {
  try {
    const guides = loadSavedGuides();
    guides.unshift(guide);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(guides.slice(0, 20)));
  } catch {}
}

function deleteGuide(id: string) {
  try {
    const guides = loadSavedGuides().filter((g) => g.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(guides));
  } catch {}
}

const summaryOptions = [
  { value: "bullet_points", label: "Bullet points" },
  { value: "outline", label: "Outline" },
  { value: "detailed", label: "Detailed" },
];

type Course = {
  id: string;
  name: string;
};

type ModuleItem = {
  itemKey: string;
  moduleId: number;
  moduleName: string;
  itemId: number;
  title: string;
  type: string;
  page_url: string | null;
  external_url: string | null;
  content_id: number | null;
  content_details: { "content-type"?: string; url?: string } | null;
  note_id?: string | null;
  source_file_id?: string | null;
};

const INPUT_STYLE: React.CSSProperties = {
  padding: "0.8rem 1rem",
  background: "rgba(255, 255, 255, 0.12)",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  borderRadius: "10px",
  color: "var(--light)",
  width: "100%",
  boxSizing: "border-box",
};

export default function NotesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  // Draft builder state — persisted so an unfinished study guide survives exit.
  const [courseId, setCourseId] = usePersistentState("conlearn:notes:courseId", "");
  const [studyGuideStyle, setStudyGuideStyle] = usePersistentState("conlearn:notes:style", "bullet_points");
  const [studyGuideLoading, setStudyGuideLoading] = useState(false);
  const [studyGuideSummary, setStudyGuideSummary] = useState<string | null>(null);
  const [studyGuideError, setStudyGuideError] = useState<string | null>(null);
  const [studyGuideWarning, setStudyGuideWarning] = useState<string | null>(null);
  const [savedGuides, setSavedGuides] = useState<SavedGuide[]>([]);
  const [viewingGuide, setViewingGuide] = useState<SavedGuide | null>(null);
  const [moduleItems, setModuleItems] = useState<ModuleItem[]>([]);
  const [selectedModuleItems, setSelectedModuleItems] = usePersistentState<Record<string, boolean>>("conlearn:notes:selectedItems", {});
  const [lessonFilter, setLessonFilter] = useState("");
  const [unitName, setUnitName] = usePersistentState("conlearn:notes:unitName", "");
  const [inputMode, setInputMode] = usePersistentState<"items" | "unit">("conlearn:notes:inputMode", "items");

  useEffect(() => {
    setSavedGuides(loadSavedGuides());
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch("/api/courses")
      .then((res) => res.json())
      .then((data) => { if (mounted) setCourses(data ?? []); })
      .catch(() => { if (mounted) setCourses([]); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadModuleItems() {
      if (!courseId) return;
      try {
        const res = await fetch(`/api/canvas/module-items?courseId=${courseId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load Canvas module items");
        if (mounted) {
          const items = Array.isArray(data) ? data : [];
          setModuleItems(items);
          setSelectedModuleItems({});
          setLessonFilter("");
          if (items.length === 0) setInputMode("unit");
          else setInputMode("items");
        }
      } catch {
        if (mounted) {
          setModuleItems([]);
          setSelectedModuleItems({});
          setInputMode("unit");
        }
      }
    }
    loadModuleItems();
    return () => { mounted = false; };
  }, [courseId]);

  // When the filter changes, auto-select ONLY the matching items (clears unmatched ones).
  // This means typing "Module 3" in the filter immediately scopes the study guide to Module 3.
  useEffect(() => {
    if (!lessonFilter.trim() || moduleItems.length === 0) return;
    const needle = lessonFilter.toLowerCase();
    const matched = moduleItems.filter(
      (item) =>
        item.title.toLowerCase().includes(needle) ||
        item.moduleName.toLowerCase().includes(needle)
    );
    if (matched.length === 0) return;
    const next: Record<string, boolean> = {};
    matched.forEach((item) => { next[item.itemKey] = true; });
    setSelectedModuleItems(next);
  }, [lessonFilter, moduleItems]);

  async function handleStudyGuide(e: React.FormEvent) {
    e.preventDefault();
    setStudyGuideError(null);
    setStudyGuideSummary(null);
    setStudyGuideWarning(null);

    if (!courseId) {
      setStudyGuideError("Select a course for the study guide.");
      return;
    }

    let requestBody: Record<string, unknown>;

    if (inputMode === "unit") {
      if (!unitName.trim()) {
        setStudyGuideError("Enter a unit name to search your Canvas pages.");
        return;
      }
      requestBody = { unitName: unitName.trim(), summaryStyle: studyGuideStyle, courseId };
    } else {
      const selectedItems = Object.entries(selectedModuleItems)
        .filter(([, selected]) => selected)
        .map(([itemKey]) => moduleItems.find((item) => item.itemKey === itemKey))
        .filter((item): item is ModuleItem => Boolean(item));

      if (selectedItems.length === 0) {
        setStudyGuideError("Select at least one lesson content to build a study guide.");
        return;
      }
      requestBody = {
        lessonItems: selectedItems.map((item) => ({
          itemKey: item.itemKey,
          itemId: item.itemId,
          type: item.type,
          pageUrl: item.page_url,
          externalUrl: item.external_url,
          contentId: item.content_id,
          noteId: item.note_id ?? null,
        })),
        summaryStyle: studyGuideStyle,
        courseId,
      };
    }

    setStudyGuideLoading(true);
    try {
      const res = await fetch("/api/notes/study-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        setStudyGuideError(data?.error || "Study guide failed.");
        return;
      }
      const summary = data?.summary || "Study guide generated.";
      setStudyGuideSummary(summary);
      const courseName = courses.find((c) => c.id === courseId)?.name ?? "Unknown course";
      const guideTitle = inputMode === "unit" ? unitName || courseName : courseName;
      const newGuide: SavedGuide = {
        id: crypto.randomUUID(),
        title: guideTitle,
        courseName,
        style: studyGuideStyle,
        content: summary,
        savedAt: new Date().toISOString(),
      };
      persistGuide(newGuide);
      setSavedGuides(loadSavedGuides());
      // Guide is done — clear the in-progress selection so the builder resets.
      setSelectedModuleItems({});
      setUnitName("");
      clearPersistentState("conlearn:notes:selectedItems");
      clearPersistentState("conlearn:notes:unitName");
      if (!data?.lessonContentIncluded) {
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

  // Group module items by unit name, filtered by search
  const filteredModuleItems = lessonFilter
    ? moduleItems.filter(
        (item) =>
          item.title.toLowerCase().includes(lessonFilter.toLowerCase()) ||
          item.moduleName.toLowerCase().includes(lessonFilter.toLowerCase())
      )
    : moduleItems;

  const groupedByUnit = filteredModuleItems.reduce<Record<string, ModuleItem[]>>((acc, item) => {
    if (!acc[item.moduleName]) acc[item.moduleName] = [];
    acc[item.moduleName].push(item);
    return acc;
  }, {});

  const totalSelected = Object.values(selectedModuleItems).filter(Boolean).length;

  return (
    <section className="section">

      {/* ── Viewing a saved guide ── */}
      {viewingGuide ? (
        <div className="mx-auto max-w-4xl mb-8 rounded-2xl border border-white/10 bg-[rgba(9,12,26,0.78)] shadow-[0_8px_48px_rgba(0,0,0,0.35)] backdrop-blur overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-white/8 px-6 py-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-0.5">Saved study guide</p>
              <h3 className="text-base font-semibold text-white">{viewingGuide.title}</h3>
              <p className="text-xs text-slate-500">{viewingGuide.courseName} · {new Date(viewingGuide.savedAt).toLocaleDateString()}</p>
            </div>
            <button
              type="button"
              onClick={() => setViewingGuide(null)}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-6 py-5 text-[#cbd5e1] text-sm leading-relaxed" style={{ lineHeight: 1.9 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{viewingGuide.content}</ReactMarkdown>
          </div>
        </div>
      ) : null}

      {/* ── My Study Guides library ── */}
      {savedGuides.length > 0 && !viewingGuide ? (
        <div className="mx-auto max-w-4xl mb-8">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-4 w-4 text-sky-300" />
            <h3 className="text-sm font-semibold text-white">My Study Guides</h3>
            <span className="text-xs text-slate-500">({savedGuides.length})</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {savedGuides.map((guide) => (
              <div
                key={guide.id}
                className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/3 px-4 py-3 transition-all hover:border-sky-400/30 hover:bg-sky-400/5 cursor-pointer"
                onClick={() => setViewingGuide(guide)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{guide.title}</p>
                  <p className="text-xs text-slate-500">{guide.courseName} · {guide.style.replace("_", " ")}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <ChevronDown className="h-3.5 w-3.5 text-slate-600 -rotate-90 group-hover:text-slate-400 transition-colors" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteGuide(guide.id);
                      setSavedGuides(loadSavedGuides());
                    }}
                    className="rounded p-0.5 text-slate-600 hover:text-red-400 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Build a study guide</h3>
          <form className="contact-form" onSubmit={handleStudyGuide}>
            <div className="form-field">
              <label htmlFor="studyGuideCourse">Course</label>
              <select id="studyGuideCourse" value={courseId} onChange={(e) => setCourseId(e.target.value)} style={INPUT_STYLE}>
                <option value="">Select a course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              {/* Mode toggle — only shown when the course has module items */}
              {moduleItems.length > 0 && (
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  {(["items", "unit"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setInputMode(mode)}
                      style={{
                        padding: "0.3rem 0.85rem",
                        borderRadius: "6px",
                        fontSize: "0.8rem",
                        fontWeight: 500,
                        border: "1px solid rgba(255,255,255,0.18)",
                        cursor: "pointer",
                        background: inputMode === mode ? "rgba(155,135,245,0.18)" : "rgba(255,255,255,0.06)",
                        color: inputMode === mode ? "rgba(155,135,245,0.95)" : "var(--gray)",
                        transition: "background 0.15s, color 0.15s",
                      }}
                    >
                      {mode === "items" ? "Select lessons" : "Type unit name"}
                    </button>
                  ))}
                </div>
              )}

              {/* Unit name input mode */}
              {inputMode === "unit" && (
                <>
                  <label>Unit name</label>
                  <input
                    type="text"
                    placeholder="e.g. Unit 3, Chapter 4, Quadratic Functions…"
                    value={unitName}
                    onChange={(e) => setUnitName(e.target.value)}
                    style={{ ...INPUT_STYLE, marginTop: "0.4rem" }}
                  />
                  <p style={{ color: "var(--gray)", fontSize: "0.82rem", marginTop: "0.5rem" }}>
                    Conlearn searches your Canvas pages for this unit and uses vision AI to extract diagrams, formulas, and notes.
                  </p>
                </>
              )}

              {/* Checklist mode */}
              {inputMode === "items" && (
                <>
                  <label>
                    Lesson content to include
                    {totalSelected > 0 && (
                      <span style={{ color: "rgba(155,135,245,0.9)", marginLeft: "0.5rem", fontWeight: 500 }}>
                        ({totalSelected} selected)
                      </span>
                    )}
                  </label>

                  {/* Filter — also auto-scopes the study guide to matching content */}
                  <input
                    type="text"
                    placeholder="Type a module name to scope (e.g. Module 3)…"
                    value={lessonFilter}
                    onChange={(e) => setLessonFilter(e.target.value)}
                    style={{ ...INPUT_STYLE, marginBottom: "0.6rem", fontSize: "0.875rem", marginTop: "0.4rem" }}
                  />

                  {/* Grouped unit list */}
                  <div
                    style={{
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "12px",
                      padding: "0.6rem 0.8rem",
                      maxHeight: "340px",
                      overflowY: "auto",
                      background: "rgba(9, 14, 24, 0.6)",
                    }}
                  >
                    {Object.entries(groupedByUnit).map(([groupName, items]) => {
                      const allChecked = items.every((i) => selectedModuleItems[i.itemKey]);
                      const someChecked = items.some((i) => selectedModuleItems[i.itemKey]);
                      return (
                        <div key={groupName} style={{ marginBottom: "0.75rem" }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              padding: "0.35rem 0",
                              borderBottom: "1px solid rgba(255,255,255,0.08)",
                              marginBottom: "0.2rem",
                            }}
                          >
                            <span
                              style={{
                                color: "rgba(155,135,245,0.9)",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                                flexGrow: 1,
                              }}
                            >
                              {groupName}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (allChecked) {
                                  // Already exclusively selected → deselect
                                  setSelectedModuleItems((prev) => {
                                    const next = { ...prev };
                                    items.forEach((i) => { next[i.itemKey] = false; });
                                    return next;
                                  });
                                } else {
                                  // Select ONLY this unit, clear everything else
                                  setSelectedModuleItems(() => {
                                    const next: Record<string, boolean> = {};
                                    items.forEach((i) => { next[i.itemKey] = true; });
                                    return next;
                                  });
                                }
                              }}
                              style={{
                                fontSize: "0.68rem",
                                color: someChecked ? "rgba(155,135,245,0.8)" : "var(--gray)",
                                background: allChecked ? "rgba(155,135,245,0.1)" : "none",
                                border: allChecked ? "1px solid rgba(155,135,245,0.3)" : "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                padding: "0.1rem 0.4rem",
                                flexShrink: 0,
                              }}
                            >
                              {allChecked ? "deselect" : "select only this"}
                            </button>
                          </div>
                          {items.map((item) => (
                            <label
                              key={item.itemKey}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "0.6rem",
                                padding: "0.28rem 0 0.28rem 0.5rem",
                                color: "var(--light)",
                                cursor: "pointer",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(selectedModuleItems[item.itemKey])}
                                onChange={(e) =>
                                  setSelectedModuleItems((prev) => ({ ...prev, [item.itemKey]: e.target.checked }))
                                }
                                style={{ marginTop: "2px", flexShrink: 0 }}
                              />
                              <span style={{ fontSize: "0.875rem", lineHeight: 1.4 }}>{item.title}</span>
                            </label>
                          ))}
                        </div>
                      );
                    })}
                    {filteredModuleItems.length === 0 && lessonFilter && (
                      <p style={{ color: "var(--gray)", fontSize: "0.875rem", padding: "0.5rem 0" }}>
                        No lessons match &quot;{lessonFilter}&quot;
                      </p>
                    )}
                  </div>

                  {/* Bulk actions */}
                  <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="contact-submit-btn"
                      style={{ width: "auto", padding: "0.45rem 1.1rem", fontSize: "0.85rem" }}
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        moduleItems.forEach((item) => { next[item.itemKey] = true; });
                        setSelectedModuleItems(next);
                      }}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="contact-submit-btn"
                      style={{ width: "auto", padding: "0.45rem 1.1rem", fontSize: "0.85rem", background: "rgba(255,255,255,0.12)", color: "var(--light)" }}
                      onClick={() => setSelectedModuleItems({})}
                    >
                      Clear
                    </button>
                  </div>

                  <p style={{ color: "var(--gray)", marginTop: "0.5rem", fontSize: "0.82rem" }}>
                    {totalSelected > 0
                      ? "Canvas pages with embedded images will be read using vision AI. Google Slides and PowerPoint files are extracted automatically."
                      : "Click \"select only this\" on a module to study that module exclusively."}
                  </p>
                </>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="studyGuideStyle">Study guide style</label>
              <select id="studyGuideStyle" value={studyGuideStyle} onChange={(e) => setStudyGuideStyle(e.target.value)} style={INPUT_STYLE}>
                {summaryOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <button type="submit" className="contact-submit-btn" disabled={studyGuideLoading}>
              {studyGuideLoading ? "Generating..." : "Generate study guide"}
            </button>

            {studyGuideError ? (
              <div className="form-message error" style={{ display: "block" }}>{studyGuideError}</div>
            ) : null}
            {studyGuideWarning ? (
              <div className="form-message" style={{ display: "block", color: "#ffd166" }}>{studyGuideWarning}</div>
            ) : null}
          </form>
        </div>
      </div>

      {studyGuideSummary ? (
        <div
          className="animate-on-scroll"
          style={{
            maxWidth: "900px",
            margin: "2rem auto 0",
            borderRadius: "20px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(9,12,26,0.78)",
            padding: "2rem 2.25rem",
            boxShadow: "0 8px 48px rgba(0,0,0,0.35)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.75rem", paddingBottom: "1rem", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#7dd3fc", boxShadow: "0 0 10px rgba(125,211,252,0.6)" }} />
            <h3 style={{ margin: 0, color: "#e2e8f0", fontSize: "1.05rem", fontWeight: 600, letterSpacing: "0.01em" }}>Study Guide</h3>
          </div>
          <div
            style={{
              color: "#cbd5e1",
              lineHeight: 1.9,
              fontSize: "1rem",
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 style={{ color: "#f1f5f9", marginTop: "1.75rem", marginBottom: "0.65rem", fontSize: "1.4rem", fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.3 }}>{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 style={{ color: "#7dd3fc", marginTop: "1.6rem", marginBottom: "0.55rem", fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", opacity: 0.9 }}>{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 style={{ color: "#e2e8f0", marginTop: "1.2rem", marginBottom: "0.4rem", fontSize: "1.05rem", fontWeight: 600 }}>{children}</h3>
                ),
                h4: ({ children }) => (
                  <h4 style={{ color: "#94a3b8", marginTop: "0.8rem", marginBottom: "0.3rem", fontSize: "0.9rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{children}</h4>
                ),
                ul: ({ children }) => (
                  <ul style={{ paddingLeft: "1.5rem", marginBottom: "0.85rem", marginTop: "0.25rem" }}>{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol style={{ paddingLeft: "1.5rem", marginBottom: "0.85rem", marginTop: "0.25rem" }}>{children}</ol>
                ),
                li: ({ children }) => (
                  <li style={{ marginBottom: "0.45rem", lineHeight: 1.75, color: "#cbd5e1" }}>{children}</li>
                ),
                p: ({ children }) => (
                  <p style={{ marginBottom: "0.85rem", lineHeight: 1.9, color: "#cbd5e1" }}>{children}</p>
                ),
                strong: ({ children }) => (
                  <strong style={{ color: "#f1f5f9", fontWeight: 600 }}>{children}</strong>
                ),
                em: ({ children }) => (
                  <em style={{ color: "#94a3b8", fontStyle: "italic" }}>{children}</em>
                ),
                hr: () => (
                  <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.1)", margin: "1.5rem 0" }} />
                ),
                blockquote: ({ children }) => (
                  <blockquote style={{ borderLeft: "3px solid #7dd3fc", paddingLeft: "1rem", margin: "1rem 0", color: "#94a3b8", fontStyle: "italic" }}>{children}</blockquote>
                ),
                code: ({ children }) => (
                  <code style={{ background: "rgba(125,211,252,0.08)", border: "1px solid rgba(125,211,252,0.15)", padding: "0.15em 0.45em", borderRadius: "5px", fontSize: "0.875em", color: "#7dd3fc", fontFamily: "monospace" }}>{children}</code>
                ),
                input: ({ type, checked }) =>
                  type === "checkbox" ? (
                    <input type="checkbox" checked={checked} readOnly style={{ marginRight: "0.5em", accentColor: "#7dd3fc" }} />
                  ) : null,
              }}
            >
              {studyGuideSummary}
            </ReactMarkdown>
          </div>
        </div>
      ) : null}

    </section>
  );
}
