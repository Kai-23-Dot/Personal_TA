"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, Dumbbell } from "lucide-react";
import { PageHero } from "@/frontend/components/ui/page-hero";
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
import { WorkspacePage, WorkspaceSectionHeader, WorkspaceSurface } from "@/frontend/components/workspace/workspace-primitives";

/** Show an upgrade toast for a 402 LIMIT_REACHED response. Returns true if handled. */
function handleLimitResponse(res: Response, data: { code?: string; error?: string }): boolean {
  if (res.status !== 402 || data?.code !== "LIMIT_REACHED") return false;
  toast.error(data?.error || "You've reached your Free plan limit.", {
    action: { label: "Upgrade", onClick: () => (window.location.href = "/pricing") },
  });
  return true;
}

// Native <select> styled to match the shared Input/Select look — used where an
// explicit empty ("no selection") option must remain choosable, which Radix
// Select's item API doesn't support (it forbids empty-string item values).
const NATIVE_SELECT_CLASS =
  "flex h-9 w-full items-center rounded-md border border-input bg-background/50 px-3 py-1 text-sm shadow-sm transition-all duration-200 ease-smooth-out hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring/60";

const difficultyOptions = [
  { value: "adaptive", label: "Adaptive" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const modeOptions = [
  { value: "quiz", label: "Quiz" },
  { value: "flashcards", label: "Flashcards" },
  { value: "mixed", label: "Mixed" },
];

const MAX_SELECTED_UNITS = 12;

type Course = {
  id: string;
  name: string;
};

type CourseModule = {
  id: string;
  moduleId: number | null;
  moduleName: string;
  source: "canvas" | "generated";
  itemCount: number;
  powerpointCount: number;
  assignmentIds: string[];
  noteIds: string[];
  moduleItemIds: number[];
};

type NoteListItem = {
  id: string;
  title: string;
  updated_at: string;
};

type ResumeEntry = {
  sessionId: string;
  topic: string;
  total: number;
  answeredCount: number;
  savedAt: string;
};

type PracticeHistoryEntry = {
  id: string;
  created_at: string;
  topic: string;
  difficulty: string;
  question_count: number;
  correct_count: number;
  course?: { name: string; color: string | null } | null;
};

export default function PracticePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCourseId = searchParams.get("course_id") ?? searchParams.get("courseId") ?? "";
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [loadingModules, setLoadingModules] = useState(false);
  const [moduleError, setModuleError] = useState<string | null>(null);
  const [moduleReload, setModuleReload] = useState(0);
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [selectedNotes, setSelectedNotes] = useState<Record<string, boolean>>({});
  const [topic, setTopic] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState("adaptive");
  const [mode, setMode] = useState("quiz");
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumable, setResumable] = useState<ResumeEntry[]>([]);
  const [history, setHistory] = useState<PracticeHistoryEntry[]>([]);

  // Scan localStorage for saved practice sessions
  useEffect(() => {
    const entries: ResumeEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("practice_resume_")) continue;
      const sid = key.replace("practice_resume_", "");
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
        entries.push({
          sessionId: sid,
          topic: parsed.topic ?? "Practice Test",
          total: parsed.total ?? 0,
          answeredCount: Object.keys(parsed.answers ?? {}).length,
          savedAt: parsed.savedAt ?? "",
        });
      } catch {
        // skip corrupt entries
      }
    }
    setResumable(entries);
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch("/api/courses").then((res) => res.ok ? res.json() : []),
      fetch("/api/practice/history").then((res) => res.ok ? res.json() : []),
    ])
      .then(([courseData, historyData]) => {
        if (mounted) {
          setCourses(Array.isArray(courseData) ? courseData : []);
          setHistory(Array.isArray(historyData) ? historyData : []);
        }
      })
      .catch(() => {
        if (mounted) setCourses([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (requestedCourseId) setCourseId(requestedCourseId);
  }, [requestedCourseId]);

  useEffect(() => {
    let mounted = true;
    async function loadNotes() {
      if (!courseId) {
        setNotes([]);
        setSelectedNotes({});
        return;
      }
      setLoadingNotes(true);
      try {
        const res = await fetch(`/api/notes/list?courseId=${courseId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load notes");
        if (mounted) {
          setNotes(data ?? []);
          setSelectedNotes({});
        }
      } catch {
        if (mounted) {
          setNotes([]);
          setSelectedNotes({});
        }
      } finally {
        if (mounted) setLoadingNotes(false);
      }
    }
    loadNotes();
    return () => {
      mounted = false;
    };
  }, [courseId]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    async function loadModules() {
      setModules([]);
      setSelectedModuleIds([]);
      setTopic("");
      setModuleError(null);
      if (!courseId) {
        setLoadingModules(false);
        return;
      }
      setLoadingModules(true);
      try {
        const res = await fetch(`/api/courses/units?courseId=${courseId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load course units.");
        const loadedUnits = Array.isArray(data?.units) ? data.units : [];
        if (mounted) {
          setModules(loadedUnits);
          setModuleError(null);
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        if (mounted) {
          setModules([]);
          setModuleError(caught instanceof Error ? caught.message : "Failed to load course units.");
        }
      } finally {
        if (mounted) setLoadingModules(false);
      }
    }
    void loadModules();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [courseId, moduleReload]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const selectedModules = modules.filter((item) =>
        selectedModuleIds.includes(item.id)
      );
      if (selectedModules.length === 0) {
        setError("Select at least one course unit before generating practice.");
        return;
      }
      const effectiveTopic =
        topic.trim() ||
        selectedModules
          .map((selectedModule) => selectedModule.moduleName)
          .join(", ")
          .slice(0, 200);
      const noteIds = Object.entries(selectedNotes)
        .filter(([, selected]) => selected)
        .map(([id]) => id);
      const selectedUnits = selectedModules.map((selectedModule) => ({
        moduleId:
          selectedModule.source === "canvas"
            ? selectedModule.moduleId
            : null,
        moduleName: selectedModule.moduleName,
        source: selectedModule.source,
        assignmentIds: selectedModule.assignmentIds,
        noteIds: selectedModule.noteIds,
        moduleItemIds: selectedModule.moduleItemIds ?? [],
      }));

      if (mode === "flashcards") {
        const res = await fetch("/api/flashcards/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(courseId ? { courseId } : {}),
            topic: effectiveTopic,
            count: Math.min(Math.max(questionCount, 5), 30),
            noteIds: noteIds.length > 0 ? noteIds : undefined,
            units: selectedUnits,
          }),
        });
        const data = await res.json();
        if (!res.ok || data?.success === false) {
          if (handleLimitResponse(res, data)) return;
          setError(data?.error || "Failed to generate flashcards.");
          return;
        }
        router.push("/flashcards");
      } else {
        const res = await fetch("/api/practice/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: effectiveTopic,
            courseId: courseId || null,
            units: selectedUnits,
            difficulty,
            questionCount,
            noteIds: noteIds.length > 0 ? noteIds : undefined,
            mode,
          }),
        });
        const data = await res.json();
        if (!res.ok || data?.success === false) {
          if (handleLimitResponse(res, data)) return;
          setError(data?.error || "Failed to generate practice test.");
          return;
        }
        if (data.sessionId) {
          router.push(`/practice/session?sessionId=${data.sessionId}`);
        } else {
          setError("Missing session id from practice generator.");
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function dismissResume(sessionId: string) {
    try { localStorage.removeItem(`practice_resume_${sessionId}`); } catch {}
    setResumable((prev) => prev.filter((e) => e.sessionId !== sessionId));
  }

  return (
    <WorkspacePage className="space-y-6">
      <PageHero
        icon={Dumbbell}
        badgeLabel="Study"
        title="Practice"
        description="Create source-grounded practice from a course unit, linked presentation, assignment, or note."
      />

      {resumable.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Resume in-progress tests</h3>
          <div className="grid gap-3">
            {resumable.map((entry) => (
              <div
                key={entry.sessionId}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-1 px-5 py-3.5"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{entry.topic}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.answeredCount}{entry.total ? ` / ${entry.total}` : ""} questions answered
                  </p>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  <Button size="sm" onClick={() => router.push(`/practice/session?sessionId=${entry.sessionId}`)}>
                    Resume →
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => dismissResume(entry.sessionId)}>
                    Discard
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Create practice</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleGenerate}>
            <div className="space-y-1.5">
              <Label htmlFor="course">Course</Label>
              <select
                id="course"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                required
                className={NATIVE_SELECT_CLASS}
              >
                <option value="">Select a course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
              {courses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No courses found. Sync Canvas on the Dashboard first.</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label id="module-selection-label">Course units / modules</Label>
                {selectedModuleIds.length > 0 ? (
                  <span className="text-xs font-medium text-sky-300">
                    {selectedModuleIds.length} selected
                  </span>
                ) : null}
              </div>
              {loadingModules ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                  <div className="skeleton-shimmer h-3.5 w-3.5 flex-shrink-0 rounded-full" aria-hidden="true" />
                  Loading units directly from your course…
                </div>
              ) : moduleError ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-rose-400" role="alert">
                  <span>{moduleError}</span>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setModuleReload((value) => value + 1)}>
                    Try again
                  </Button>
                </div>
              ) : courseId && modules.length === 0 ? (
                <p className="text-sm text-muted-foreground">No usable course material was found yet. Sync the course or add notes, then try again.</p>
              ) : (
                <>
                  {modules.length > 0 ? (
                    <div
                      className="max-h-[280px] space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-2"
                      role="group"
                      aria-labelledby="module-selection-label"
                    >
                      {modules.map((item) => {
                        const selected = selectedModuleIds.includes(item.id);
                        return (
                          <label
                            key={item.id}
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                              selected
                                ? "border-sky-400/35 bg-sky-400/10"
                                : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(event) => {
                                if (event.target.checked) {
                                  if (selectedModuleIds.length >= MAX_SELECTED_UNITS) {
                                    toast.error(
                                      `Choose up to ${MAX_SELECTED_UNITS} units per practice set.`
                                    );
                                    return;
                                  }
                                  setSelectedModuleIds((current) => [
                                    ...current,
                                    item.id,
                                  ]);
                                  return;
                                }
                                setSelectedModuleIds((current) =>
                                  current.filter((id) => id !== item.id)
                                );
                              }}
                              className="mt-0.5 rounded accent-sky-400"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-foreground">
                                {item.moduleName}
                              </span>
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {item.itemCount} item{item.itemCount === 1 ? "" : "s"}
                                {item.powerpointCount > 0
                                  ? ` · ${item.powerpointCount} PowerPoint${item.powerpointCount === 1 ? "" : "s"}`
                                  : ""}
                                {item.source === "generated"
                                  ? " · organized by Smartlearn"
                                  : ""}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                  {modules.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setSelectedModuleIds(
                            modules
                              .slice(0, MAX_SELECTED_UNITS)
                              .map((item) => item.id)
                          );
                          if (modules.length > MAX_SELECTED_UNITS) {
                            toast.info(
                              `Selected the first ${MAX_SELECTED_UNITS} units. Tests support up to ${MAX_SELECTED_UNITS} units at once.`
                            );
                          }
                        }}
                      >
                        Select all
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedModuleIds([])}
                      >
                        Clear
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Choose one or more units, up to {MAX_SELECTED_UNITS}.
                      </span>
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {modules.some((item) => item.source === "generated")
                      ? "This course does not publish modules, so Smartlearn organized its assignments and notes into selectable units."
                      : "Practice combines pages, assignments, and linked PowerPoints from every selected unit."}
                  </p>
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="topic">Focus within selected units (optional)</Label>
              <Input
                id="topic"
                type="text"
                placeholder="e.g. key terms or a specific concept"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Practice from selected notes (optional)</Label>
              {loadingNotes ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="skeleton-shimmer h-3.5 w-3.5 flex-shrink-0 rounded-full" aria-hidden="true" />
                  <span className="text-sm">Loading notes…</span>
                </div>
              ) : courseId && notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes found for this course yet. Upload or import notes first.</p>
              ) : null}
              {notes.length > 0 ? (
                <div className="max-h-[240px] overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
                  {notes.map((note) => (
                    <label key={note.id} className="flex items-center gap-2.5 py-1.5 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedNotes[note.id])}
                        onChange={(e) =>
                          setSelectedNotes((prev) => ({ ...prev, [note.id]: e.target.checked }))
                        }
                        className="rounded accent-sky-400"
                      />
                      <span>{note.title}</span>
                    </label>
                  ))}
                </div>
              ) : null}
              {notes.length > 0 ? (
                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const next: Record<string, boolean> = {};
                      notes.forEach((note) => {
                        next[note.id] = true;
                      });
                      setSelectedNotes(next);
                    }}
                  >
                    Select all
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedNotes({})}>
                    Clear
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="questions">Number of questions</Label>
              <Input
                id="questions"
                type="number"
                min={5}
                max={20}
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="difficulty">Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger id="difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {difficultyOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mode">Mode</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger id="mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            </div>
            <Button
              type="submit"
              disabled={
                loading || loadingModules || selectedModuleIds.length === 0
              }
            >
              {loading ? "Generating..." : "Generate test"}
            </Button>
            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          </form>
        </CardContent>
      </Card>

      <WorkspaceSurface>
        <WorkspaceSectionHeader title="Recent practice" description="Completed sessions from your active courses" />
        {history.length === 0 ? <div className="px-5 py-10 text-center text-sm text-muted-foreground">Complete a practice session and it will appear here.</div> : history.slice(0, 8).map((entry) => {
          const score = entry.question_count > 0 ? Math.round((entry.correct_count / entry.question_count) * 100) : null;
          return <button key={entry.id} type="button" onClick={() => router.push(`/practice/session?sessionId=${encodeURIComponent(entry.id)}`)} className="group grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border px-4 py-2.5 text-left last:border-b-0 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><span className="min-w-0"><span className="block truncate text-sm font-medium">{entry.topic}</span><span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground"><span className="h-2 w-2 rounded-sm" style={{ backgroundColor: entry.course?.color ?? "#83b9ff" }} />{entry.course?.name ?? "Practice"} · {new Date(entry.created_at).toLocaleDateString()}</span></span><span className="text-xs font-medium text-muted-foreground">{score === null ? `${entry.question_count} questions` : `${score}%`}</span><ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></button>;
        })}
      </WorkspaceSurface>
    </WorkspacePage>
  );
}
