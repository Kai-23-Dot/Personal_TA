"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  AlertCircle, BookOpen, CheckCircle2, Clock3, Flame,
  GraduationCap, Link2, RefreshCw, Sparkles, Target, Zap,
} from "lucide-react";
import { StatTile } from "@/frontend/components/ui/stat-tile";

type CourseRef = { id: string; name: string; color: string | null } | null;
type AssignmentRow = {
  id: string; title: string; due_date: string | null;
  is_completed: boolean; assignment_type?: string; course?: CourseRef;
};
type LmsConnection = {
  id: string; platform: string; canvas_domain: string | null;
  last_synced_at: string | null; is_active: boolean;
};
type Course = { id: string; name: string; color: string | null };
type Profile = { full_name: string | null };
type FocusSession = { duration_minutes: number | null; started_at: string };
type PracticeActivity = { created_at: string };
type WeakMetric = { topic: string; accuracy_pct: number };
type Recommendation = {
  topic: string;
  course_name: string | null;
  accuracy_pct: number | null;
  priority_score: number;
  due_date: string | null;
  reason: string;
  course_id: string | null;
};
type Notification = { id: string; title: string; body: string | null; read_at: string | null };
type DashboardLoadState = "loading" | "ready" | "error";

// ── Section card ──
function SectionCard({ title, subtitle, action, children, className = "" }: {
  title: string; subtitle?: string; action?: React.ReactNode;
  children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-white/8 bg-[rgba(9,12,24,0.76)] p-5 shadow-[0_8px_40px_rgba(0,0,0,0.3)] backdrop-blur ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`skeleton-shimmer rounded-2xl ${className}`} aria-hidden="true" />;
}

// ── Quick action link ──
function QuickAction({ href, icon, label, desc }: { href: string; icon: React.ReactNode; label: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-3.5 transition-all duration-200 hover:border-white/15 hover:bg-white/6 hover:scale-[1.015] hover:shadow-[0_4px_20px_rgba(0,0,0,0.2)] active:scale-[0.99]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white/8">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight text-white">{label}</p>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
      <span className="ml-auto text-slate-600 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-slate-400">→</span>
    </Link>
  );
}

export default function DashboardPage() {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [connections, setConnections] = useState<LmsConnection[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [practiceActivity, setPracticeActivity] = useState<PracticeActivity[]>([]);
  const [metrics, setMetrics] = useState<WeakMetric[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notesCount, setNotesCount] = useState(0);
  const [loadState, setLoadState] = useState<DashboardLoadState>("loading");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());

  async function loadDashboardData() {
    setLoadState("loading");
    try {
      const [aR, cR, crR, pR, fR, prR, mR, nR, ntsR, recR] = await Promise.all([
        fetch("/api/assignments"),
        fetch("/api/lms/connections"),
        fetch("/api/courses"),
        fetch("/api/profile"),
        fetch("/api/focus/history"),
        fetch("/api/practice/history"),
        fetch("/api/performance/weak"),
        fetch("/api/notifications"),
        fetch("/api/notes/list"),
        fetch("/api/study/recommendations"),
      ]);
      if (!aR.ok || !cR.ok || !crR.ok) throw new Error("Could not load dashboard data.");
      const [aD, cD, crD, pD, fD, prD, mD, nD, ntsD, recD] = await Promise.all([
        aR.json(), cR.json(), crR.json(),
        pR.ok ? pR.json() : null,
        fR.ok ? fR.json() : [],
        prR.ok ? prR.json() : [],
        mR.ok ? mR.json() : [],
        nR.ok ? nR.json() : [],
        ntsR.ok ? ntsR.json() : [],
        recR.ok ? recR.json() : [],
      ]);
      setAssignments(aD ?? []);
      setConnections(cD ?? []);
      setCourses(crD ?? []);
      setProfile(pD);
      setFocusSessions(fD ?? []);
      setPracticeActivity(prD ?? []);
      setMetrics(mD ?? []);
      setRecommendations(Array.isArray(recD) ? recD : []);
      setNotifications(nD ?? []);
      setNotesCount(Array.isArray(ntsD) ? ntsD.length : 0);
      setSelectedCourseIds(new Set((crD ?? []).map((c: Course) => c.id)));
      setLoadState("ready");
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Failed to load dashboard.");
      setLoadState("error");
    }
  }

  useEffect(() => { loadDashboardData(); }, []);

  const canvasConnection = connections.find((c) => c.platform === "canvas" && c.is_active);

  const filteredAssignments = useMemo(() => {
    if (selectedCourseIds.size === 0) return assignments;
    return assignments.filter((a) => selectedCourseIds.has(a.course?.id ?? ""));
  }, [assignments, selectedCourseIds]);

  const upcomingAssignments = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + 7 * 86_400_000);
    return filteredAssignments
      .filter((a) => a.due_date && !a.is_completed)
      .map((a) => ({ ...a, due: parseISO(a.due_date as string) }))
      .filter((a) => a.due >= now && a.due <= cutoff)
      .sort((a, b) => a.due.getTime() - b.due.getTime());
  }, [filteredAssignments]);

  const hoursThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86_400_000;
    const mins = focusSessions
      .filter((s) => new Date(s.started_at).getTime() >= weekAgo)
      .reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
    return Math.round(mins / 60);
  }, [focusSessions]);

  const studyStreak = useMemo(() => {
    // Count any day with a focus session OR a completed practice session
    const days = new Set([
      ...focusSessions.map((s) => format(new Date(s.started_at), "yyyy-MM-dd")),
      ...practiceActivity.map((s) => format(new Date(s.created_at), "yyyy-MM-dd")),
    ]);
    let streak = 0;
    for (let i = 0; i < 60; i++) {
      const key = format(new Date(Date.now() - i * 86_400_000), "yyyy-MM-dd");
      if (!days.has(key)) break;
      streak += 1;
    }
    return streak;
  }, [focusSessions, practiceActivity]);

  const retrievalConfidence = useMemo(() => {
    if (!canvasConnection) return { label: "Unavailable", tone: "text-slate-500", pct: 0 };
    if (notesCount >= 25) return { label: "High",   tone: "text-sky-300",    pct: 87 };
    if (notesCount >= 8)  return { label: "Medium", tone: "text-blue-300",   pct: 68 };
    return                       { label: "Low",    tone: "text-orange-300", pct: 39 };
  }, [canvasConnection, notesCount]);

  async function handleSync() {
    setSyncMessage(null);
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/all", { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        setSyncMessage(data?.error || "Sync failed. Check your LMS connection.");
      } else {
        setSyncMessage("Sync complete — latest course content is now indexed.");
        await loadDashboardData();
      }
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  const emptyNoConnection = !canvasConnection;
  const emptyNoCourses = !emptyNoConnection && courses.length === 0;
  const firstName = profile?.full_name?.split(" ")[0] ?? null;
  const urgentCount = upcomingAssignments.filter((a) => a.due.getTime() - Date.now() < 48 * 3_600_000).length;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 pb-20 pt-6">

      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[rgba(9,12,26,0.84)] px-7 py-8 shadow-[0_20px_80px_rgba(0,0,0,0.3)] backdrop-blur">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-sky-500/6 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-violet-500/4 blur-3xl" />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">
              {format(new Date(), "EEEE, MMMM d, yyyy")}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[1.75rem]">
              {firstName ? `Good to see you, ${firstName}.` : "Welcome back."}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {upcomingAssignments.length > 0
                ? `You have ${upcomingAssignments.length} assignment${upcomingAssignments.length !== 1 ? "s" : ""} due this week${urgentCount > 0 ? ` — ${urgentCount} urgent` : ""}.`
                : "You're all caught up this week. Great work!"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={emptyNoConnection ? "/settings/setup/canvas" : "/practice"}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              <Zap className="h-3.5 w-3.5" />
              {emptyNoConnection ? "Connect Canvas" : "Practice Test"}
            </a>
            <button
              className="btn btn-secondary inline-flex items-center gap-2"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync"}
            </button>
          </div>
        </div>

        {syncMessage && (
          <p className="relative mt-4 flex items-start gap-2 text-xs text-slate-300">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-300" />
            {syncMessage}
          </p>
        )}
      </div>

      {/* ── Loading ── */}
      {loadState === "loading" && (
        <div className="space-y-6" role="status" aria-label="Loading dashboard">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[...Array(4)].map((_, i) => <SkeletonBlock key={i} className="h-[100px]" />)}
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <SkeletonBlock className="h-72 lg:col-span-2" />
            <SkeletonBlock className="h-72" />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <SkeletonBlock className="h-56" />
            <SkeletonBlock className="h-56" />
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {loadState === "error" && (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/8 p-8 text-center">
          <p className="mb-4 text-sm text-slate-300">{syncMessage ?? "Failed to load dashboard."}</p>
          <div className="flex justify-center gap-3">
            <button className="btn btn-primary" onClick={() => loadDashboardData()}>Retry</button>
            <a href="/settings" className="btn btn-secondary">Settings</a>
          </div>
        </div>
      )}

      {/* ── Ready ── */}
      {loadState === "ready" && (
        <>
          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              className="animate-fade-in"
              style={{ animationDelay: "0ms", animationFillMode: "backwards" }}
              icon={<Clock3 className="h-5 w-5" />}
              label="Due this week"
              value={upcomingAssignments.length}
              tone={urgentCount > 0 ? "orange" : "sky"}
              sub={urgentCount > 0 ? `${urgentCount} due within 48h` : "No urgent deadlines"}
              gradientBar
            />
            <StatTile
              className="animate-fade-in"
              style={{ animationDelay: "60ms", animationFillMode: "backwards" }}
              icon={<Flame className="h-5 w-5" />}
              label="Study streak"
              value={studyStreak}
              unit="days"
              tone="violet"
              sub={studyStreak > 0 ? "Keep the momentum" : "Start a session today"}
            />
            <StatTile
              className="animate-fade-in"
              style={{ animationDelay: "120ms", animationFillMode: "backwards" }}
              icon={<BookOpen className="h-5 w-5" />}
              label="Focus hours"
              value={hoursThisWeek}
              unit="hrs"
              tone="sky"
              sub="Logged this week"
            />
            <StatTile
              className="animate-fade-in"
              style={{ animationDelay: "180ms", animationFillMode: "backwards" }}
              icon={<GraduationCap className="h-5 w-5" />}
              label="Content indexed"
              value={notesCount}
              unit="items"
              tone="emerald"
              sub={`${retrievalConfidence.label} retrieval confidence`}
            />
          </div>

          {/* Setup prompt */}
          {(emptyNoConnection || emptyNoCourses) && (
            <div className="flex items-start gap-4 rounded-2xl border border-sky-400/20 bg-sky-500/8 px-5 py-4">
              <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
              <div>
                <p className="text-sm font-medium text-sky-100">
                  {emptyNoConnection
                    ? "Connect Canvas to import your courses, assignments, and materials automatically."
                    : "Canvas is connected — run your first sync to import courses."}
                </p>
                <div className="mt-3 flex gap-2.5">
                  {emptyNoConnection ? (
                    <a href="/settings/setup/canvas" className="btn btn-primary">Connect Canvas</a>
                  ) : (
                    <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
                      {syncing ? "Syncing…" : "Run first sync"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Due this week + Quick actions */}
          <div className="grid gap-6 lg:grid-cols-3">
            <SectionCard
              title="Due this week"
              subtitle={`${upcomingAssignments.length} assignment${upcomingAssignments.length !== 1 ? "s" : ""} coming up`}
              action={<a href="/assignments" className="btn btn-secondary">View all →</a>}
              className="lg:col-span-2"
            >
              {upcomingAssignments.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <CheckCircle2 className="h-9 w-9 text-sky-300/50" />
                  <p className="text-sm text-slate-400">Nothing due this week — you&apos;re ahead of the game.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {upcomingAssignments.map((a) => {
                    const urgent = a.due.getTime() - Date.now() < 48 * 3_600_000;
                    const daysLeft = Math.ceil((a.due.getTime() - Date.now()) / 86_400_000);
                    return (
                      <li
                        key={a.id}
                        className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-150 hover:scale-[1.003] ${
                          urgent
                            ? "border-orange-400/25 bg-orange-500/8 hover:border-orange-400/35"
                            : "border-white/8 bg-white/3 hover:border-white/14 hover:bg-white/5"
                        }`}
                      >
                        <div className={`flex shrink-0 items-center rounded-full border-l-[3px] py-1.5 pl-2.5 pr-3 text-xs font-semibold ${
                          urgent ? "border-l-orange-400 bg-orange-500/15 text-orange-200" : "border-l-sky-400 bg-sky-500/12 text-sky-200"
                        }`}>
                          {format(a.due, "MMM d")}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{a.title}</p>
                          <p className="text-xs text-slate-500">{a.course?.name ?? "Unknown course"}</p>
                        </div>
                        <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                          urgent ? "bg-orange-500/20 text-orange-200" : "bg-white/6 text-slate-400"
                        }`}>
                          {daysLeft <= 0 ? "Today" : daysLeft === 1 ? "Tomorrow" : `${daysLeft}d`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>

            {/* Quick actions */}
            <div className="flex flex-col gap-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Quick actions</p>
              <QuickAction
                href="/practice"
                icon={<Target className="h-[1.1rem] w-[1.1rem] text-sky-300" />}
                label="Practice Test"
                desc="AI quiz on any topic"
              />
              <QuickAction
                href="/flashcards"
                icon={<Sparkles className="h-[1.1rem] w-[1.1rem] text-violet-300" />}
                label="Flashcards"
                desc="Spaced repetition study"
              />
              <QuickAction
                href="/notes"
                icon={<BookOpen className="h-[1.1rem] w-[1.1rem] text-emerald-300" />}
                label="Study Guide"
                desc="AI notes from your course"
              />
              <QuickAction
                href="/chat"
                icon={<GraduationCap className="h-[1.1rem] w-[1.1rem] text-amber-300" />}
                label="Ask Conlearn"
                desc="Chat with your AI tutor"
              />
            </div>
          </div>

          {/* Courses + Recommendations */}
          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard
              title="My courses"
              subtitle="Filter dashboard by course"
              action={
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: "0.3rem 0.7rem", fontSize: "0.72rem" }}
                    onClick={() => setSelectedCourseIds(new Set(courses.map((c) => c.id)))}
                  >All</button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: "0.3rem 0.7rem", fontSize: "0.72rem" }}
                    onClick={() => setSelectedCourseIds(new Set())}
                  >None</button>
                </div>
              }
            >
              {courses.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <GraduationCap className="h-8 w-8 text-slate-600" />
                  <p className="text-sm text-slate-400">No courses synced yet.</p>
                  <button className="btn btn-secondary mt-1" onClick={handleSync} disabled={syncing}>Sync now</button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {courses.map((course) => {
                    const selected = selectedCourseIds.has(course.id);
                    return (
                      <label
                        key={course.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-150 ${
                          selected
                            ? "border-sky-400/30 bg-sky-400/8"
                            : "border-white/6 bg-white/3 hover:border-white/12 hover:bg-white/5"
                        }`}
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: course.color ?? "#22d3ee" }} />
                        <span className="flex-1 truncate text-sm text-slate-100">{course.name}</span>
                        <input
                          type="checkbox"
                          aria-label={`Toggle ${course.name}`}
                          checked={selected}
                          className="accent-sky-400"
                          onChange={() => {
                            setSelectedCourseIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(course.id)) next.delete(course.id);
                              else next.add(course.id);
                              return next;
                            });
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="What to study next"
              subtitle="Ranked by grade impact × your mastery gaps"
              action={<a href="/practice" className="btn btn-secondary">Practice →</a>}
            >
              {recommendations.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <Target className="h-8 w-8 text-slate-600" />
                  <p className="text-sm text-slate-400">Sync Canvas to generate personalized study priorities.</p>
                  <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
                    {syncing ? "Syncing…" : "Sync Canvas"}
                  </button>
                </div>
              ) : (
                <ul className="space-y-2">
                  {recommendations.slice(0, 5).map((r, i) => (
                    <li key={`${r.topic}-${i}`} className="rounded-xl border border-white/6 bg-white/3 px-3 py-3 transition-colors duration-150 hover:border-sky-400/20 hover:bg-sky-500/[0.06]">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-sky-500/15 text-[11px] font-semibold text-sky-300">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{r.topic}</p>
                          {r.course_name && (
                            <p className="mt-0.5 truncate text-xs text-slate-500">{r.course_name}</p>
                          )}
                          <p className="mt-1 text-xs text-slate-500 leading-snug">{r.reason}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {r.accuracy_pct !== null ? (
                            <span className={`text-sm font-bold ${
                              r.accuracy_pct < 50 ? "text-red-300" : r.accuracy_pct < 70 ? "text-amber-300" : "text-sky-300"
                            }`}>
                              {r.accuracy_pct}%
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500">Not tested</span>
                          )}
                          <a
                            href={`/practice${r.course_id ? `?courseId=${r.course_id}` : ""}`}
                            className="text-xs text-sky-400 hover:text-sky-300 transition-colors"
                          >
                            Practice →
                          </a>
                        </div>
                      </div>
                      {r.accuracy_pct !== null && (
                        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/8">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${r.accuracy_pct}%`,
                              background: r.accuracy_pct < 50 ? "#fda4af" : r.accuracy_pct < 70 ? "#fcd34d" : "#7dd3fc",
                            }}
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          {/* Status footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/2 px-5 py-3.5">
            <span className="flex items-center gap-2 text-xs text-slate-500">
              <span className={`h-1.5 w-1.5 rounded-full ${canvasConnection ? "bg-sky-400" : "bg-orange-400"}`} />
              Canvas: {canvasConnection
                ? `${canvasConnection.canvas_domain} · last sync ${canvasConnection.last_synced_at ? format(new Date(canvasConnection.last_synced_at), "MMM d, p") : "never"}`
                : "Not connected"}
            </span>
            {retrievalConfidence.label === "Low" && canvasConnection ? (
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1.5 text-xs font-medium text-orange-300 hover:text-orange-200 transition-colors"
              >
                <span className={`h-1.5 w-1.5 rounded-full bg-orange-400 ${syncing ? "animate-pulse" : ""}`} />
                {syncing ? "Indexing…" : "Index more course files →"}
              </button>
            ) : (
              <span className={`text-xs font-medium ${retrievalConfidence.tone}`}>
                {retrievalConfidence.label === "High"
                  ? `${notesCount} items indexed — questions are grounded in your actual class`
                  : `Retrieval: ${retrievalConfidence.label} · ${retrievalConfidence.pct}%`}
              </span>
            )}
          </div>

          {/* Notifications — only when present */}
          {notifications.length > 0 && (
            <SectionCard title="Notifications" subtitle="Unread updates">
              <ul className="space-y-2">
                {notifications.slice(0, 3).map((n) => (
                  <li key={n.id} className="rounded-xl border border-white/8 bg-white/3 p-3">
                    <p className="text-sm font-medium text-white">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs text-slate-400">{n.body}</p>}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
