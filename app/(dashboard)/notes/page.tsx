"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, ChevronRight, FileText, Focus, Search, X } from "lucide-react";
import { cn } from "@/backend/utils";
import { usePersistentState, clearPersistentState } from "@/frontend/hooks/usePersistentState";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import {
  StatusTag,
  WorkspacePage,
  WorkspacePageHeader,
  WorkspaceSectionHeader,
  WorkspaceSurface,
} from "@/frontend/components/workspace/workspace-primitives";

type SavedGuide = { id: string; title: string; courseName: string; style: string; content: string; savedAt: string };
type Course = { id: string; name: string };
type ModuleItem = { itemKey: string; moduleId: number; moduleName: string; itemId: number; title: string; type: string; page_url: string | null; external_url: string | null; content_id: number | null; content_details: { "content-type"?: string; url?: string } | null; note_id?: string | null; source_file_id?: string | null };
type NoteRecord = { id: string; title: string | null; updated_at: string; course_id: string | null; unit_name: string | null; file_name: string | null; file_type: string | null; source_type?: string | null };
type NoteDetail = NoteRecord & { content: string | null; source_type: string; source_url: string | null; word_count: number | null; topic_tags: string[] | null; is_processed: boolean; course: { id: string; name: string; color: string | null } | null };

const STORAGE_KEY = "smartlearn_study_guides";
const summaryOptions = [{ value: "bullet_points", label: "Bullet points" }, { value: "outline", label: "Outline" }, { value: "detailed", label: "Detailed" }];

function loadSavedGuides(): SavedGuide[] { try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
function persistGuide(guide: SavedGuide) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify([guide, ...loadSavedGuides()].slice(0, 20))); } catch {} }
function deleteGuide(id: string) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loadSavedGuides().filter((guide) => guide.id !== id))); } catch {} }
function sourceLabel(source: string) { if (source === "canvas") return "Imported from Canvas"; if (source === "manual") return "User-created"; return "Imported material"; }

export default function NotesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedNoteId = searchParams.get("noteId");
  const requestedCourseId = searchParams.get("course_id") ?? searchParams.get("courseId") ?? "";
  const [courses, setCourses] = useState<Course[]>([]);
  const [noteRecords, setNoteRecords] = useState<NoteRecord[]>([]);
  const [noteQuery, setNoteQuery] = useState("");
  const [libraryCourse, setLibraryCourse] = useState(requestedCourseId || "all");
  const [selectedNote, setSelectedNote] = useState<NoteDetail | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [focusedReading, setFocusedReading] = useState(false);
  const [courseId, setCourseId] = usePersistentState("smartlearn:notes:courseId", requestedCourseId);
  const [studyGuideStyle, setStudyGuideStyle] = usePersistentState("smartlearn:notes:style", "bullet_points");
  const [studyGuideLoading, setStudyGuideLoading] = useState(false);
  const [studyGuideSummary, setStudyGuideSummary] = useState<string | null>(null);
  const [studyGuideError, setStudyGuideError] = useState<string | null>(null);
  const [studyGuideWarning, setStudyGuideWarning] = useState<string | null>(null);
  const [savedGuides, setSavedGuides] = useState<SavedGuide[]>([]);
  const [viewingGuide, setViewingGuide] = useState<SavedGuide | null>(null);
  const [moduleItems, setModuleItems] = useState<ModuleItem[]>([]);
  const [selectedModuleItems, setSelectedModuleItems] = usePersistentState<Record<string, boolean>>("smartlearn:notes:selectedItems", {});
  const [lessonFilter, setLessonFilter] = useState("");
  const [unitName, setUnitName] = usePersistentState("smartlearn:notes:unitName", "");
  const [inputMode, setInputMode] = usePersistentState<"items" | "unit">("smartlearn:notes:inputMode", "items");

  useEffect(() => { setSavedGuides(loadSavedGuides()); }, []);
  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/courses").then((response) => response.ok ? response.json() : []), fetch("/api/notes/list").then((response) => response.ok ? response.json() : [])]).then(([courseData, notesData]) => { if (!active) return; setCourses(Array.isArray(courseData) ? courseData : []); setNoteRecords(Array.isArray(notesData) ? notesData : []); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (requestedCourseId) { setCourseId(requestedCourseId); setLibraryCourse(requestedCourseId); } }, [requestedCourseId, setCourseId]);
  useEffect(() => {
    let active = true;
    if (!requestedNoteId) { setSelectedNote(null); setNoteError(null); setFocusedReading(false); return; }
    setNoteLoading(true); setNoteError(null); setViewingGuide(null);
    fetch(`/api/notes/${encodeURIComponent(requestedNoteId)}`).then(async (response) => { const data = await response.json().catch(() => null); if (!response.ok) throw new Error(data?.error ?? "The note could not be loaded."); return data; }).then((data) => { if (active) setSelectedNote(data); }).catch((error) => { if (active) { setSelectedNote(null); setNoteError(error instanceof Error ? error.message : "The note could not be loaded."); } }).finally(() => { if (active) setNoteLoading(false); });
    return () => { active = false; };
  }, [requestedNoteId]);
  useEffect(() => {
    if (focusedReading) document.documentElement.dataset.smartlearnReadingMode = "true";
    else delete document.documentElement.dataset.smartlearnReadingMode;
    return () => { delete document.documentElement.dataset.smartlearnReadingMode; };
  }, [focusedReading]);

  useEffect(() => {
    let active = true;
    async function loadModuleItems() {
      if (!courseId) { setModuleItems([]); return; }
      try {
        const response = await fetch(`/api/canvas/module-items?courseId=${encodeURIComponent(courseId)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Failed to load Canvas module items");
        if (!active) return;
        const items = Array.isArray(data) ? data : [];
        setModuleItems(items); setSelectedModuleItems({}); setLessonFilter(""); setInputMode(items.length === 0 ? "unit" : "items");
      } catch { if (active) { setModuleItems([]); setSelectedModuleItems({}); setInputMode("unit"); } }
    }
    void loadModuleItems();
    return () => { active = false; };
  }, [courseId, setInputMode, setSelectedModuleItems]);

  useEffect(() => {
    if (!lessonFilter.trim() || moduleItems.length === 0) return;
    const needle = lessonFilter.toLowerCase();
    const matched = moduleItems.filter((item) => item.title.toLowerCase().includes(needle) || item.moduleName.toLowerCase().includes(needle));
    if (!matched.length) return;
    const next: Record<string, boolean> = {};
    matched.forEach((item) => { next[item.itemKey] = true; });
    setSelectedModuleItems(next);
  }, [lessonFilter, moduleItems, setSelectedModuleItems]);

  async function handleStudyGuide(event: React.FormEvent) {
    event.preventDefault(); setStudyGuideError(null); setStudyGuideSummary(null); setStudyGuideWarning(null);
    if (!courseId) { setStudyGuideError("Select a course for the study guide."); return; }
    let requestBody: Record<string, unknown>;
    if (inputMode === "unit") {
      if (!unitName.trim()) { setStudyGuideError("Enter a unit name to search your Canvas pages."); return; }
      requestBody = { unitName: unitName.trim(), summaryStyle: studyGuideStyle, courseId };
    } else {
      const selectedItems = Object.entries(selectedModuleItems).filter(([, selected]) => selected).map(([itemKey]) => moduleItems.find((item) => item.itemKey === itemKey)).filter((item): item is ModuleItem => Boolean(item));
      if (!selectedItems.length) { setStudyGuideError("Select at least one lesson to build a study guide."); return; }
      requestBody = { lessonItems: selectedItems.map((item) => ({ itemKey: item.itemKey, itemId: item.itemId, type: item.type, pageUrl: item.page_url, externalUrl: item.external_url, contentId: item.content_id, noteId: item.note_id ?? null })), summaryStyle: studyGuideStyle, courseId };
    }
    setStudyGuideLoading(true);
    try {
      const response = await fetch("/api/notes/study-guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
      const data = await response.json();
      if (!response.ok || data?.success === false) { setStudyGuideError(data?.error || "Study guide failed."); return; }
      const summary = data?.summary || "Study guide generated.";
      setStudyGuideSummary(summary);
      const courseName = courses.find((course) => course.id === courseId)?.name ?? "Unknown course";
      const guide: SavedGuide = { id: crypto.randomUUID(), title: inputMode === "unit" ? unitName || courseName : courseName, courseName, style: studyGuideStyle, content: summary, savedAt: new Date().toISOString() };
      persistGuide(guide); setSavedGuides(loadSavedGuides()); setSelectedModuleItems({}); setUnitName(""); clearPersistentState("smartlearn:notes:selectedItems"); clearPersistentState("smartlearn:notes:unitName");
      if (!data?.lessonContentIncluded) setStudyGuideWarning("Some linked slides could not be accessed. Share the source file or attach the PowerPoint in Canvas, then try again.");
    } catch (error) { setStudyGuideError(error instanceof Error ? error.message : "Study guide failed."); } finally { setStudyGuideLoading(false); }
  }

  const filteredModuleItems = lessonFilter ? moduleItems.filter((item) => item.title.toLowerCase().includes(lessonFilter.toLowerCase()) || item.moduleName.toLowerCase().includes(lessonFilter.toLowerCase())) : moduleItems;
  const groupedByUnit = filteredModuleItems.reduce<Record<string, ModuleItem[]>>((groups, item) => { (groups[item.moduleName] ??= []).push(item); return groups; }, {});
  const totalSelected = Object.values(selectedModuleItems).filter(Boolean).length;
  const visibleNotes = useMemo(() => noteRecords.filter((note) => (libraryCourse === "all" || note.course_id === libraryCourse) && [note.title, note.file_name, note.unit_name].some((value) => value?.toLowerCase().includes(noteQuery.trim().toLowerCase()))), [libraryCourse, noteQuery, noteRecords]);

  function openNote(note: NoteRecord) { const params = new URLSearchParams(searchParams.toString()); params.set("noteId", note.id); router.push(`/notes?${params.toString()}`, { scroll: false }); }
  function closeReader() { const params = new URLSearchParams(searchParams.toString()); params.delete("noteId"); router.replace(params.size ? `/notes?${params.toString()}` : "/notes", { scroll: false }); setViewingGuide(null); setFocusedReading(false); }

  return (
    <WorkspacePage wide={focusedReading} className={focusedReading ? "max-w-[900px]" : undefined}>
      {!focusedReading ? <WorkspacePageHeader icon={BookOpen} eyebrow="Learn" title="Notes & materials" description="Read imported course material and build focused study guides from Canvas modules and linked presentations." /> : null}
      <div className={cn("mt-5 grid items-start gap-4", focusedReading ? "grid-cols-1" : "lg:grid-cols-[17rem_minmax(0,1fr)]")}>
        {!focusedReading ? <WorkspaceSurface className={cn("lg:sticky lg:top-20", (selectedNote || viewingGuide) && "hidden lg:block")}>
          <WorkspaceSectionHeader title="Library" description={`${visibleNotes.length} indexed material${visibleNotes.length === 1 ? "" : "s"}`} />
          <div className="space-y-2 border-b border-border p-3">
            <label className="relative block"><span className="sr-only">Search notes and materials</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={noteQuery} onChange={(event) => setNoteQuery(event.target.value)} placeholder="Search library…" className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
            <select value={libraryCourse} onChange={(event) => setLibraryCourse(event.target.value)} aria-label="Filter library by course" className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"><option value="all">All courses</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select>
          </div>
          <div className="max-h-[42vh] overflow-y-auto border-b border-border">
            <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Course materials</p>
            {visibleNotes.length === 0 ? <p className="px-3 py-6 text-center text-xs text-muted-foreground">No matching material.</p> : visibleNotes.map((note) => <button key={note.id} type="button" onClick={() => openNote(note)} className={cn("flex min-h-12 w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", selectedNote?.id === note.id && "bg-accent")}><FileText className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-foreground">{note.title || note.file_name || "Untitled material"}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{note.unit_name || note.file_type || "Material"}</span></span><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></button>)}
          </div>
          <div className="max-h-64 overflow-y-auto pb-2"><p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Generated guides</p>{savedGuides.length === 0 ? <p className="px-3 py-4 text-center text-xs text-muted-foreground">No saved guides yet.</p> : savedGuides.map((guide) => <div key={guide.id} className="group flex items-center"><button type="button" onClick={() => { setViewingGuide(guide); setSelectedNote(null); }} className="min-h-12 min-w-0 flex-1 px-3 py-2 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><span className="block truncate text-xs font-medium">{guide.title}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{guide.courseName} · {guide.style.replace("_", " ")}</span></button><button type="button" onClick={() => { deleteGuide(guide.id); setSavedGuides(loadSavedGuides()); }} aria-label={`Delete ${guide.title}`} className="mr-2 grid h-9 w-9 place-items-center rounded-md text-muted-foreground opacity-0 hover:bg-danger/10 hover:text-danger focus:opacity-100 group-hover:opacity-100"><X className="h-3.5 w-3.5" /></button></div>)}</div>
        </WorkspaceSurface> : null}

        <div className="min-w-0 space-y-4">
          {noteLoading ? <WorkspaceSurface className="p-6"><div className="skeleton-shimmer h-6 w-48 rounded-md" /><div className="mt-6 space-y-3">{[1, 2, 3, 4].map((item) => <div key={item} className="skeleton-shimmer h-4 rounded-md" />)}</div></WorkspaceSurface> : noteError ? <WorkspaceSurface className="p-6 text-center"><p className="text-sm text-danger">{noteError}</p><Button variant="secondary" className="mt-4" onClick={closeReader}>Back to library</Button></WorkspaceSurface> : selectedNote ? <WorkspaceSurface className="overflow-visible">
            <header className="border-b border-border px-5 py-4 sm:px-7"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs text-muted-foreground">{selectedNote.course?.name ?? "Notes"} / {selectedNote.unit_name ?? sourceLabel(selectedNote.source_type)}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{selectedNote.title || selectedNote.file_name || "Untitled material"}</h2><div className="mt-3 flex flex-wrap items-center gap-2"><StatusTag tone={selectedNote.source_type === "manual" ? "accent" : "neutral"}>{sourceLabel(selectedNote.source_type)}</StatusTag><span className="text-xs text-muted-foreground">Updated {new Date(selectedNote.updated_at).toLocaleString()}</span>{selectedNote.word_count ? <span className="text-xs text-muted-foreground">{selectedNote.word_count.toLocaleString()} words</span> : null}</div></div><div className="flex gap-1"><button type="button" onClick={() => setFocusedReading((value) => !value)} aria-label={focusedReading ? "Exit focused reading mode" : "Enter focused reading mode"} className="grid h-11 w-11 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><Focus className="h-4 w-4" /></button><button type="button" onClick={closeReader} aria-label="Close material" className="grid h-11 w-11 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button></div></div></header>
            <article className="mx-auto max-w-3xl px-5 py-7 sm:px-8 sm:py-10">{selectedNote.content ? <ReactMarkdown remarkPlugins={[remarkGfm]} className="md-content">{selectedNote.content}</ReactMarkdown> : <p className="text-sm text-muted-foreground">This material has no readable extracted text yet.</p>}{selectedNote.source_url ? <p className="mt-8 border-t border-border pt-4"><a href={selectedNote.source_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">Open original source</a></p> : null}</article>
          </WorkspaceSurface> : viewingGuide ? <WorkspaceSurface><header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4"><div><p className="text-xs text-muted-foreground">Saved study guide · {viewingGuide.courseName}</p><h2 className="mt-1 text-xl font-semibold">{viewingGuide.title}</h2></div><button type="button" onClick={() => setViewingGuide(null)} aria-label="Close study guide" className="grid h-11 w-11 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button></header><article className="mx-auto max-w-3xl px-5 py-8 sm:px-8"><ReactMarkdown remarkPlugins={[remarkGfm]} className="md-content">{viewingGuide.content}</ReactMarkdown></article></WorkspaceSurface> : <WorkspaceSurface>
            <WorkspaceSectionHeader title="Build a study guide" description="Choose the exact Canvas modules, pages, and linked presentations to include." />
            <form className="space-y-6 p-4 sm:p-5" onSubmit={handleStudyGuide}>
              <div className="space-y-1.5"><Label htmlFor="studyGuideCourse">Course</Label><select id="studyGuideCourse" value={courseId} onChange={(event) => setCourseId(event.target.value)} className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"><option value="">Select a course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></div>
              <div>{moduleItems.length > 0 ? <div className="mb-3 flex gap-1 border-b border-border pb-2">{(["items", "unit"] as const).map((mode) => <button key={mode} type="button" onClick={() => setInputMode(mode)} className={cn("min-h-10 rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground", inputMode === mode && "bg-accent text-accent-foreground")}>{mode === "items" ? "Select lessons" : "Type unit name"}</button>)}</div> : null}
                {inputMode === "unit" ? <div className="space-y-1.5"><Label htmlFor="unitName">Unit name</Label><Input id="unitName" placeholder="e.g. Unit 3, Chapter 4, Quadratic Functions…" value={unitName} onChange={(event) => setUnitName(event.target.value)} /><p className="text-xs leading-5 text-muted-foreground">Smartlearn searches Canvas pages and linked files for this unit.</p></div> : <div className="space-y-2"><Label>Lesson content {totalSelected > 0 ? <span className="ml-1 text-primary">({totalSelected} selected)</span> : null}</Label><Input placeholder="Filter by module or lesson…" value={lessonFilter} onChange={(event) => setLessonFilter(event.target.value)} /><div className="max-h-[22rem] overflow-y-auto rounded-lg border border-border">{Object.entries(groupedByUnit).map(([groupName, items]) => { const allChecked = items.every((item) => selectedModuleItems[item.itemKey]); return <section key={groupName}><div className="flex items-center gap-2 border-b border-border bg-surface-1 px-3 py-2"><h3 className="min-w-0 flex-1 truncate text-xs font-semibold">{groupName}</h3><button type="button" onClick={() => setSelectedModuleItems(() => { const next: Record<string, boolean> = {}; if (!allChecked) items.forEach((item) => { next[item.itemKey] = true; }); return next; })} className="min-h-8 rounded px-2 text-[11px] text-primary hover:bg-accent">{allChecked ? "Deselect" : "Select module"}</button></div>{items.map((item) => <label key={item.itemKey} className="flex min-h-11 cursor-pointer items-start gap-2.5 border-b border-border px-3 py-2.5 last:border-b-0 hover:bg-surface-2"><input type="checkbox" checked={Boolean(selectedModuleItems[item.itemKey])} onChange={(event) => setSelectedModuleItems((current) => ({ ...current, [item.itemKey]: event.target.checked }))} className="mt-0.5" /><span className="text-sm leading-5">{item.title}</span></label>)}</section>; })}{filteredModuleItems.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">{courseId ? "No module items match this filter. Use a unit name instead." : "Select a course to load its modules."}</p> : null}</div><div className="flex gap-2"><Button type="button" size="sm" onClick={() => { const next: Record<string, boolean> = {}; moduleItems.forEach((item) => { next[item.itemKey] = true; }); setSelectedModuleItems(next); }}>Select all</Button><Button type="button" variant="secondary" size="sm" onClick={() => setSelectedModuleItems({})}>Clear</Button></div><p className="text-xs leading-5 text-muted-foreground">Canvas pages, Google Slides, and PowerPoint files linked inside the selected module are retrieved when accessible.</p></div>}
              </div>
              <div className="space-y-1.5"><Label htmlFor="studyGuideStyle">Study guide style</Label><select id="studyGuideStyle" value={studyGuideStyle} onChange={(event) => setStudyGuideStyle(event.target.value)} className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm">{summaryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
              <Button type="submit" disabled={studyGuideLoading} className="h-11">{studyGuideLoading ? "Generating…" : "Generate study guide"}</Button>
              {studyGuideError ? <p className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{studyGuideError}</p> : null}{studyGuideWarning ? <p className="rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-warning">{studyGuideWarning}</p> : null}
            </form>
          </WorkspaceSurface>}
          {studyGuideSummary && !selectedNote && !viewingGuide ? <WorkspaceSurface><WorkspaceSectionHeader title="Generated study guide" /><article className="mx-auto max-w-3xl px-5 py-8"><ReactMarkdown remarkPlugins={[remarkGfm]} className="md-content">{studyGuideSummary}</ReactMarkdown></article></WorkspaceSurface> : null}
        </div>
      </div>
    </WorkspacePage>
  );
}
