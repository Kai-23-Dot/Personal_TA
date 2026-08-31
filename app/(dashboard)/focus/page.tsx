"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Pause, Play, RotateCcw, Square, Timer } from "lucide-react";
import { usePersistentState } from "@/frontend/hooks/usePersistentState";
import { Button } from "@/frontend/components/ui/button";
import { PageHero } from "@/frontend/components/ui/page-hero";
import { StatusTag, WorkspacePage, WorkspaceSectionHeader, WorkspaceSurface } from "@/frontend/components/workspace/workspace-primitives";

type Course = { id: string; name: string };
type FocusHistory = { id: string; duration_minutes: number | null; started_at: string; ended_at: string | null; status: string };
type StoredTimer = { durationMinutes: number; remainingSeconds: number; running: boolean; endAt: number | null; sessionId: string | null };
const TIMER_KEY = "smartlearn:focus:timer-state";
const DURATION_PRESETS = [15, 25, 45, 60];

function initialTimer(): StoredTimer {
  const fallback = { durationMinutes: 25, remainingSeconds: 25 * 60, running: false, endAt: null, sessionId: null };
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TIMER_KEY) ?? "null") as StoredTimer | null;
    if (!parsed || !DURATION_PRESETS.includes(parsed.durationMinutes)) return fallback;
    const remaining = parsed.running && parsed.endAt ? Math.max(0, Math.ceil((parsed.endAt - Date.now()) / 1000)) : parsed.remainingSeconds;
    return { ...parsed, remainingSeconds: remaining, running: parsed.running && remaining > 0, endAt: parsed.running && remaining > 0 ? parsed.endAt : null };
  } catch { return fallback; }
}

export default function FocusPage() {
  const [timer, setTimer] = useState<StoredTimer>(initialTimer);
  const [task, setTask] = usePersistentState("smartlearn:focus:task", "");
  const [courseId, setCourseId] = usePersistentState("smartlearn:focus:courseId", "");
  const [courses, setCourses] = useState<Course[]>([]);
  const [history, setHistory] = useState<FocusHistory[]>([]);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    const [courseResponse, historyResponse] = await Promise.all([fetch("/api/courses"), fetch("/api/focus/history")]);
    const [courseData, historyData] = await Promise.all([courseResponse.ok ? courseResponse.json() : [], historyResponse.ok ? historyResponse.json() : []]);
    setCourses(Array.isArray(courseData) ? courseData : []);
    setHistory(Array.isArray(historyData) ? historyData : []);
  }, []);

  const finishDatabaseSession = useCallback(async (sessionId: string, status: "completed" | "cancelled") => {
    try {
      await fetch("/api/focus", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, status }) });
      await loadWorkspace();
    } catch { setError("The session ended locally, but its history could not be updated."); }
  }, [loadWorkspace]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);
  useEffect(() => { try { window.localStorage.setItem(TIMER_KEY, JSON.stringify(timer)); } catch {} }, [timer]);
  useEffect(() => {
    if (timer.running) document.documentElement.dataset.smartlearnFocusMode = "true";
    else delete document.documentElement.dataset.smartlearnFocusMode;
    return () => { delete document.documentElement.dataset.smartlearnFocusMode; };
  }, [timer.running]);

  useEffect(() => {
    if (!timer.running || !timer.endAt) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil(((timer.endAt as number) - Date.now()) / 1000));
      if (remaining > 0) { setTimer((current) => ({ ...current, remainingSeconds: remaining })); return; }
      setTimer((current) => ({ ...current, remainingSeconds: 0, running: false, endAt: null, sessionId: null }));
      setCompleted(true);
      if (timer.sessionId) void finishDatabaseSession(timer.sessionId, "completed");
    };
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [finishDatabaseSession, timer.endAt, timer.running, timer.sessionId]);

  function chooseDuration(minutes: number) {
    if (timer.running) return;
    setCompleted(false);
    setTimer({ durationMinutes: minutes, remainingSeconds: minutes * 60, running: false, endAt: null, sessionId: null });
  }

  async function toggleRunning() {
    setError(null);
    if (timer.running) {
      const remaining = timer.endAt ? Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000)) : timer.remainingSeconds;
      setTimer((current) => ({ ...current, remainingSeconds: remaining, running: false, endAt: null }));
      return;
    }
    let sessionId = timer.sessionId;
    if (!sessionId) {
      try {
        const response = await fetch("/api/focus", { method: "POST", headers: { "Content-Type": "application/json" } });
        const data = await response.json();
        if (!response.ok || !data?.session?.id) throw new Error(data?.error ?? "The focus session could not be started.");
        sessionId = data.session.id;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The focus session could not be started.");
        return;
      }
    }
    setCompleted(false);
    setTimer((current) => ({ ...current, sessionId, running: true, endAt: Date.now() + current.remainingSeconds * 1000 }));
  }

  function resetTimer() {
    if (timer.sessionId) void finishDatabaseSession(timer.sessionId, "cancelled");
    setCompleted(false);
    setTimer((current) => ({ ...current, remainingSeconds: current.durationMinutes * 60, running: false, endAt: null, sessionId: null }));
  }

  function endSession() {
    if (timer.sessionId) void finishDatabaseSession(timer.sessionId, "completed");
    setCompleted(true);
    setTimer((current) => ({ ...current, running: false, endAt: null, sessionId: null }));
  }

  const minutes = Math.floor(timer.remainingSeconds / 60).toString().padStart(2, "0");
  const seconds = (timer.remainingSeconds % 60).toString().padStart(2, "0");
  const progress = 1 - timer.remainingSeconds / (timer.durationMinutes * 60);
  const selectedCourse = courses.find((course) => course.id === courseId);
  const todaySessions = useMemo(() => history.filter((session) => new Date(session.started_at).toDateString() === new Date().toDateString()), [history]);

  if (timer.running) {
    return <WorkspacePage className="flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col items-center justify-center py-8 text-center"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Focus session</p><h1 className="mt-3 max-w-xl truncate text-lg font-medium text-muted-foreground">{task || "Focused work"}{selectedCourse ? ` · ${selectedCourse.name}` : ""}</h1><p className="mt-8 font-mono text-[clamp(4.5rem,18vw,8rem)] font-semibold leading-none tracking-[-0.08em] tabular-nums text-foreground" aria-live="polite">{minutes}:{seconds}</p><div className="mt-7 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }} /></div><div className="mt-10 flex items-center gap-3"><Button variant="secondary" size="icon" onClick={() => void toggleRunning()} aria-label="Pause session" className="h-12 w-12"><Pause className="h-5 w-5" /></Button><Button variant="destructive" onClick={endSession} className="h-12 px-5"><Square className="h-4 w-4" />End session</Button></div><p className="mt-8 text-xs text-muted-foreground">The timer will keep its place if you refresh or navigate away.</p></WorkspacePage>;
  }

  return (
    <WorkspacePage className="space-y-5">
      <PageHero icon={Timer} badgeLabel="Study" title="Focus" description="Choose one task, set a duration, and remove everything else until the session ends." />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <WorkspaceSurface>
          <WorkspaceSectionHeader title={completed ? "Session complete" : "Start a focus session"} description={completed ? "Take a short break or reset for another block." : "Timer state is preserved across ordinary navigation and refresh."} />
          <div className="p-5 sm:p-7">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Focus duration">
              {DURATION_PRESETS.map((duration) => <button key={duration} type="button" onClick={() => chooseDuration(duration)} aria-pressed={timer.durationMinutes === duration} className={`min-h-11 rounded-md border px-4 text-sm font-medium transition-colors ${timer.durationMinutes === duration ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`}>{duration} min</button>)}
            </div>
            <div className="my-8 text-center">{completed ? <><CheckCircle2 className="mx-auto h-9 w-9 text-success" /><p className="mt-3 text-lg font-semibold">Nice work.</p></> : <p className="font-mono text-[clamp(4rem,15vw,7rem)] font-semibold leading-none tracking-[-0.08em] tabular-nums">{minutes}:{seconds}</p>}</div>
            <div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-medium text-muted-foreground">Task</span><input value={task} onChange={(event) => setTask(event.target.value)} maxLength={80} placeholder="What are you focusing on?" className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><label><span className="mb-1.5 block text-xs font-medium text-muted-foreground">Course</span><select value={courseId} onChange={(event) => setCourseId(event.target.value)} className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm"><option value="">No course selected</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label></div>
            {error ? <p className="mt-4 rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p> : null}
            <div className="mt-6 flex items-center justify-center gap-2"><Button variant="secondary" size="icon" onClick={resetTimer} aria-label="Reset timer" className="h-11 w-11"><RotateCcw className="h-4 w-4" /></Button><Button onClick={() => void toggleRunning()} disabled={completed} className="h-11 px-6"><Play className="h-4 w-4" />Start focus</Button></div>
          </div>
        </WorkspaceSurface>
        <WorkspaceSurface><WorkspaceSectionHeader title="Session history" description={`${todaySessions.length} completed today`} />{history.length === 0 ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">No completed focus sessions yet.</p> : <div>{history.slice(0, 8).map((session) => <div key={session.id} className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0"><span><span className="block text-sm font-medium">{session.duration_minutes ?? 0} min</span><span className="mt-0.5 block text-xs text-muted-foreground">{new Date(session.started_at).toLocaleDateString()} · {new Date(session.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></span><StatusTag tone="success">Completed</StatusTag></div>)}</div>}</WorkspaceSurface>
      </div>
    </WorkspacePage>
  );
}
