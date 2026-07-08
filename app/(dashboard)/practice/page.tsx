"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dumbbell } from "lucide-react";
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

type Course = {
  id: string;
  name: string;
};

type NoteListItem = {
  id: string;
  title: string;
  updated_at: string;
};

type Assignment = {
  id: string;
  title: string;
  course_id: string;
};

type ResumeEntry = {
  sessionId: string;
  topic: string;
  total: number;
  answeredCount: number;
  savedAt: string;
};

export default function PracticePage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [selectedNotes, setSelectedNotes] = useState<Record<string, boolean>>({});
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentId, setAssignmentId] = useState("");
  const [topic, setTopic] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState("adaptive");
  const [mode, setMode] = useState("quiz");
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumable, setResumable] = useState<ResumeEntry[]>([]);

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
    async function loadAssignments() {
      if (!courseId) {
        setAssignments([]);
        setAssignmentId("");
        return;
      }
      const res = await fetch(`/api/assignments?course_id=${courseId}`);
      const data = await res.json();
      if (mounted) setAssignments(data ?? []);
    }
    loadAssignments();
    return () => {
      mounted = false;
    };
  }, [courseId]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const assignmentTitle = assignments.find((a) => a.id === assignmentId)?.title ?? "";
      const effectiveTopic = topic || assignmentTitle || "Course practice";
      const noteIds = Object.entries(selectedNotes)
        .filter(([, selected]) => selected)
        .map(([id]) => id);

      if (mode === "flashcards") {
        const res = await fetch("/api/flashcards/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId: noteIds[0] ?? null,
            courseId: courseId || null,
            topic: effectiveTopic,
            count: Math.min(Math.max(questionCount, 5), 40),
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
            difficulty,
            questionCount,
            noteIds: noteIds.length > 0 ? noteIds : undefined,
            assignmentId: assignmentId || null,
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
    <div className="mx-auto max-w-3xl space-y-6 pb-16 pt-6">
      <PageHero
        icon={Dumbbell}
        badgeLabel="Adaptive Testing"
        title="Practice"
        description="Generate an AI practice test scoped to a course, topic, assignment, or your own notes."
      />

      {resumable.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Resume in-progress tests</h3>
          <div className="grid gap-3">
            {resumable.map((entry) => (
              <div
                key={entry.sessionId}
                className="flex items-center justify-between gap-4 rounded-xl border border-sky-400/20 bg-[rgba(9,12,26,0.72)] px-5 py-3.5"
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
          <CardTitle>Generate a practice test</CardTitle>
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
              <Label htmlFor="topic">Topic</Label>
              <Input
                id="topic"
                type="text"
                placeholder="e.g. Quadratic equations"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assignment">Assignment (optional)</Label>
              <select
                id="assignment"
                value={assignmentId}
                onChange={(e) => setAssignmentId(e.target.value)}
                className={NATIVE_SELECT_CLASS}
              >
                <option value="">No assignment selected</option>
                {assignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.title}
                  </option>
                ))}
              </select>
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
            <div className="space-y-1.5">
              <Label htmlFor="questions">Number of questions</Label>
              <Input
                id="questions"
                type="number"
                min={5}
                max={50}
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
            <Button type="submit" disabled={loading}>
              {loading ? "Generating..." : "Generate test"}
            </Button>
            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
