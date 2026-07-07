"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, ChevronDown, X } from "lucide-react";
import { usePersistentState, clearPersistentState } from "@/frontend/hooks/usePersistentState";
import { cn } from "@/backend/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";

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
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Notes</h1>

      {/* ── Viewing a saved guide ── */}
      {viewingGuide ? (
        <Card variant="panel" className="overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-white/8 px-6 py-4">
            <div>
              <p className="mb-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Saved study guide</p>
              <h3 className="text-base font-semibold text-foreground">{viewingGuide.title}</h3>
              <p className="text-xs text-muted-foreground">{viewingGuide.courseName} · {new Date(viewingGuide.savedAt).toLocaleDateString()}</p>
            </div>
            <button
              type="button"
              onClick={() => setViewingGuide(null)}
              className="rounded-lg p-2 text-muted-foreground transition-colors duration-150 hover:bg-white/10 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-6 py-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]} className="md-content">{viewingGuide.content}</ReactMarkdown>
          </div>
        </Card>
      ) : null}

      {/* ── My Study Guides library ── */}
      {savedGuides.length > 0 && !viewingGuide ? (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-sky-300" />
            <h3 className="text-sm font-semibold text-foreground">My Study Guides</h3>
            <span className="text-xs text-muted-foreground">({savedGuides.length})</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {savedGuides.map((guide) => (
              <div
                key={guide.id}
                className="group flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition-colors duration-150 hover:border-sky-400/30 hover:bg-sky-400/5"
                onClick={() => setViewingGuide(guide)}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{guide.title}</p>
                  <p className="text-xs text-muted-foreground">{guide.courseName} · {guide.style.replace("_", " ")}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-muted-foreground transition-colors duration-150 group-hover:text-foreground/70" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteGuide(guide.id);
                      setSavedGuides(loadSavedGuides());
                    }}
                    className="rounded p-0.5 text-muted-foreground transition-colors duration-150 hover:text-rose-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Build a study guide</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleStudyGuide}>
            <div className="space-y-1.5">
              <Label htmlFor="studyGuideCourse">Course</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger id="studyGuideCourse">
                  <SelectValue placeholder="Select a course" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>{course.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              {/* Mode toggle — only shown when the course has module items */}
              {moduleItems.length > 0 && (
                <div className="mb-3 flex gap-2">
                  {(["items", "unit"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setInputMode(mode)}
                      className={cn(
                        "rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-colors duration-150",
                        inputMode === mode
                          ? "border-sky-400/30 bg-sky-500/15 text-sky-200"
                          : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {mode === "items" ? "Select lessons" : "Type unit name"}
                    </button>
                  ))}
                </div>
              )}

              {/* Unit name input mode */}
              {inputMode === "unit" && (
                <div className="space-y-1.5">
                  <Label htmlFor="unitName">Unit name</Label>
                  <Input
                    id="unitName"
                    type="text"
                    placeholder="e.g. Unit 3, Chapter 4, Quadratic Functions…"
                    value={unitName}
                    onChange={(e) => setUnitName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Conlearn searches your Canvas pages for this unit and uses vision AI to extract diagrams, formulas, and notes.
                  </p>
                </div>
              )}

              {/* Checklist mode */}
              {inputMode === "items" && (
                <div className="space-y-1.5">
                  <Label>
                    Lesson content to include
                    {totalSelected > 0 && (
                      <span className="ml-2 font-medium text-sky-300">({totalSelected} selected)</span>
                    )}
                  </Label>

                  {/* Filter — also auto-scopes the study guide to matching content */}
                  <Input
                    type="text"
                    placeholder="Type a module name to scope (e.g. Module 3)…"
                    value={lessonFilter}
                    onChange={(e) => setLessonFilter(e.target.value)}
                  />

                  {/* Grouped unit list */}
                  <div className="max-h-[340px] overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                    {Object.entries(groupedByUnit).map(([groupName, items]) => {
                      const allChecked = items.every((i) => selectedModuleItems[i.itemKey]);
                      const someChecked = items.some((i) => selectedModuleItems[i.itemKey]);
                      return (
                        <div key={groupName} className="mb-3">
                          <div className="mb-1 flex items-center gap-2 border-b border-white/8 py-1.5">
                            <span className="flex-grow text-xs font-bold uppercase tracking-wider text-sky-300">
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
                              className={cn(
                                "flex-shrink-0 rounded px-1.5 py-0.5 text-[11px]",
                                allChecked
                                  ? "border border-sky-400/30 bg-sky-500/10 text-sky-300"
                                  : someChecked
                                    ? "text-sky-300/80"
                                    : "text-muted-foreground"
                              )}
                            >
                              {allChecked ? "deselect" : "select only this"}
                            </button>
                          </div>
                          {items.map((item) => (
                            <label
                              key={item.itemKey}
                              className="flex cursor-pointer items-start gap-2.5 py-1 pl-2 text-foreground"
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(selectedModuleItems[item.itemKey])}
                                onChange={(e) =>
                                  setSelectedModuleItems((prev) => ({ ...prev, [item.itemKey]: e.target.checked }))
                                }
                                className="mt-0.5 flex-shrink-0 rounded accent-sky-400"
                              />
                              <span className="text-sm leading-tight">{item.title}</span>
                            </label>
                          ))}
                        </div>
                      );
                    })}
                    {filteredModuleItems.length === 0 && lessonFilter && (
                      <p className="py-2 text-sm text-muted-foreground">
                        No lessons match &quot;{lessonFilter}&quot;
                      </p>
                    )}
                  </div>

                  {/* Bulk actions */}
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        moduleItems.forEach((item) => { next[item.itemKey] = true; });
                        setSelectedModuleItems(next);
                      }}
                    >
                      Select all
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedModuleItems({})}>
                      Clear
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {totalSelected > 0
                      ? "Canvas pages with embedded images will be read using vision AI. Google Slides and PowerPoint files are extracted automatically."
                      : "Click \"select only this\" on a module to study that module exclusively."}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="studyGuideStyle">Study guide style</Label>
              <Select value={studyGuideStyle} onValueChange={setStudyGuideStyle}>
                <SelectTrigger id="studyGuideStyle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {summaryOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={studyGuideLoading}>
                {studyGuideLoading ? "Generating..." : "Generate study guide"}
              </Button>
            </div>

            {studyGuideError ? <p className="text-sm text-rose-400">{studyGuideError}</p> : null}
            {studyGuideWarning ? <p className="text-sm text-amber-400">{studyGuideWarning}</p> : null}
          </form>
        </CardContent>
      </Card>

      {studyGuideSummary ? (
        <Card variant="panel" className="p-8">
          <div className="mb-6 flex items-center gap-3 border-b border-white/8 pb-4">
            <div className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.6)]" />
            <h3 className="text-base font-semibold text-foreground">Study Guide</h3>
          </div>
          <ReactMarkdown remarkPlugins={[remarkGfm]} className="md-content">
            {studyGuideSummary}
          </ReactMarkdown>
        </Card>
      ) : null}
    </div>
  );
}
