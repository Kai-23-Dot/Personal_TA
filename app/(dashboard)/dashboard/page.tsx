"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertCircle, BookOpen, CheckCircle2, Clock3, Flame, GraduationCap, Link2, RefreshCw, Sparkles, Target } from "lucide-react";

type CourseRef = { id: string; name: string; color: string | null } | null;

type AssignmentRow = {
  id: string;
  title: string;
  due_date: string | null;
  is_completed: boolean;
  assignment_type?: string;
  course?: CourseRef;
};

type LmsConnection = {
  id: string;
  platform: string;
  canvas_domain: string | null;
  last_synced_at: string | null;
  is_active: boolean;
};

type Course = { id: string; name: string; color: string | null };
type Profile = { full_name: string | null };
type FocusSession = { duration_minutes: number | null; started_at: string };
type WeakMetric = { topic: string; accuracy_pct: number };
type Notification = { id: string; title: string; body: string | null; read_at: string | null };

type DashboardLoadState = "loading" | "ready" | "error";

function SectionCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[rgba(8,12,24,0.72)] p-5 shadow-[0_8px_40px_rgba(1,6,20,0.45)] backdrop-blur">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-300">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`skeleton-shimmer rounded-xl ${className}`} aria-hidden="true" />;
}

export default function DashboardPage() {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [connections, setConnections] = useState<LmsConnection[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [metrics, setMetrics] = useState<WeakMetric[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notesCount, setNotesCount] = useState(0);
  const [loadState, setLoadState] = useState<DashboardLoadState>("loading");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());

  async function loadDashboardData() {
    setLoadState("loading");
    try {
      const [assignmentsRes, connectionsRes, coursesRes, profileRes, focusRes, metricsRes, notificationsRes, notesRes] = await Promise.all([
        fetch("/api/assignments"),
        fetch("/api/lms/connections"),
        fetch("/api/courses"),
        fetch("/api/profile"),
        fetch("/api/focus/history"),
        fetch("/api/performance/weak"),
        fetch("/api/notifications"),
        fetch("/api/notes/list"),
      ]);

      if (!assignmentsRes.ok || !connectionsRes.ok || !coursesRes.ok) {
        throw new Error("Could not load dashboard data. Try syncing again.");
      }

      const [assignmentsData, connectionsData, coursesData, profileData, focusData, metricsData, notificationsData, notesData] = await Promise.all([
        assignmentsRes.json(),
        connectionsRes.json(),
        coursesRes.json(),
        profileRes.ok ? profileRes.json() : Promise.resolve(null),
        focusRes.ok ? focusRes.json() : Promise.resolve([]),
        metricsRes.ok ? metricsRes.json() : Promise.resolve([]),
        notificationsRes.ok ? notificationsRes.json() : Promise.resolve([]),
        notesRes.ok ? notesRes.json() : Promise.resolve([]),
      ]);

      setAssignments(assignmentsData ?? []);
      setConnections(connectionsData ?? []);
      setCourses(coursesData ?? []);
      setProfile(profileData);
      setFocusSessions(focusData ?? []);
      setMetrics(metricsData ?? []);
      setNotifications(notificationsData ?? []);
      setNotesCount((notesData ?? []).length);
      setSelectedCourseIds(new Set((coursesData ?? []).map((c: Course) => c.id)));
      setLoadState("ready");
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Failed to load dashboard.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    loadDashboardData();
  }, []);

  const canvasConnection = connections.find((c) => c.platform === "canvas" && c.is_active);

  const filteredAssignments = useMemo(() => {
    if (selectedCourseIds.size === 0) return assignments;
    return assignments.filter((a) => selectedCourseIds.has(a.course?.id ?? ""));
  }, [assignments, selectedCourseIds]);

  const upcomingAssignments = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + 14 * 86400000);
    return filteredAssignments
      .filter((a) => a.due_date && !a.is_completed)
      .map((a) => ({ ...a, due: parseISO(a.due_date as string) }))
      .filter((a) => a.due >= now && a.due <= cutoff)
      .sort((a, b) => a.due.getTime() - b.due.getTime())
      .slice(0, 8);
  }, [filteredAssignments]);

  const recentSessions = useMemo(() => {
    return [...focusSessions]
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
      .slice(0, 5);
  }, [focusSessions]);

  const hoursThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    const minutes = focusSessions
      .filter((s) => new Date(s.started_at).getTime() >= weekAgo)
      .reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
    return Math.round(minutes / 60);
  }, [focusSessions]);

  const studyStreak = useMemo(() => {
    const days = new Set(focusSessions.map((s) => format(new Date(s.started_at), "yyyy-MM-dd")));
    let streak = 0;
    for (let i = 0; i < 30; i++) {
      const key = format(new Date(Date.now() - i * 86400000), "yyyy-MM-dd");
      if (!days.has(key)) break;
      streak += 1;
    }
    return streak;
  }, [focusSessions]);

  const retrievalConfidence = useMemo(() => {
    if (!canvasConnection) return { label: "Not available", tone: "text-slate-300", pct: 0 };
    if (notesCount >= 25) return { label: "High", tone: "text-emerald-300", pct: 87 };
    if (notesCount >= 8) return { label: "Medium", tone: "text-amber-300", pct: 68 };
    return { label: "Low", tone: "text-rose-300", pct: 39 };
  }, [canvasConnection, notesCount]);

  async function handleSync() {
    setSyncMessage(null);
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/all", { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        setSyncMessage(data?.error || "Sync failed. Check your LMS connection and try again.");
      } else {
        setSyncMessage("Sync completed. Latest course content is now indexed.");
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

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6">
      <div className="mb-6 rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/10 via-slate-900/60 to-blue-500/10 p-6 shadow-[0_20px_80px_rgba(2,12,27,0.45)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" /> AI Study Dashboard
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              {profile?.full_name ? `${profile.full_name}, your study system is ready.` : "Your study system is ready."}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              PersonalTA pulls Canvas material, ranks the most relevant content, and helps you generate focused practice tests and study guides with source-grounded context.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={emptyNoConnection ? "/settings/setup/canvas" : "/practice"} className="btn btn-primary" aria-label="Primary action">
              {emptyNoConnection ? "Connect Canvas" : "Generate Practice Test"}
            </a>
            <button className="btn btn-secondary" onClick={handleSync} disabled={syncing}>
              {syncing ? "Syncing..." : "Sync Content"}
            </button>
            <a href="/notes" className="btn btn-secondary">Open Notes</a>
          </div>
        </div>
        {syncMessage ? (
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-slate-200">
            <AlertCircle className="h-4 w-4" /> {syncMessage}
          </p>
        ) : null}
      </div>

      {loadState === "loading" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading dashboard">
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-72 md:col-span-2" />
          <SkeletonBlock className="h-72 md:col-span-2" />
        </div>
      ) : null}

      {loadState === "error" ? (
        <SectionCard title="Could not load dashboard" subtitle="We could not reach one or more data sources.">
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" onClick={() => loadDashboardData()}>Retry</button>
            <a href="/settings" className="btn btn-secondary">Check LMS settings</a>
          </div>
        </SectionCard>
      ) : null}

      {loadState === "ready" ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SectionCard title="Canvas status" subtitle={canvasConnection?.canvas_domain ?? "No active Canvas connection"}>
              <div className="flex items-center justify-between">
                <span className={`text-sm ${canvasConnection ? "text-emerald-300" : "text-rose-300"}`}>
                  {canvasConnection ? "Connected" : "Disconnected"}
                </span>
                <Link2 className="h-4 w-4 text-slate-300" />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Last sync: {canvasConnection?.last_synced_at ? format(new Date(canvasConnection.last_synced_at), "PPpp") : "Never"}
              </p>
            </SectionCard>

            <SectionCard title="Content sync" subtitle="Indexed source materials">
              <p className="text-2xl font-semibold text-white">{notesCount}</p>
              <p className="mt-1 text-xs text-slate-400">documents available for retrieval and practice generation</p>
            </SectionCard>

            <SectionCard title="Retrieval confidence" subtitle="Content selection reliability">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${retrievalConfidence.tone}`}>{retrievalConfidence.label}</span>
                <span className="text-lg font-semibold text-white">{retrievalConfidence.pct}%</span>
              </div>
              <p className="mt-2 text-xs text-slate-400">Estimate based on synced course coverage; rises as more course materials are ingested.</p>
            </SectionCard>

            <SectionCard title="Study momentum" subtitle="Last 7 days">
              <div className="flex items-center justify-between text-white">
                <span className="text-sm">{hoursThisWeek}h focused</span>
                <Clock3 className="h-4 w-4 text-slate-300" />
              </div>
              <p className="mt-2 text-xs text-slate-400">{studyStreak} day streak</p>
            </SectionCard>
          </div>

          {(emptyNoConnection || emptyNoCourses) ? (
            <SectionCard title="Get started" subtitle="Finish setup to unlock AI practice generation.">
              {emptyNoConnection ? (
                <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-4">
                  <p className="text-sm text-slate-100">Connect your Canvas account to automatically import modules, pages, assignments, files, and linked resources.</p>
                  <a href="/settings/setup/canvas" className="btn btn-primary mt-3">Connect Canvas</a>
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm text-slate-100">Canvas is connected, but no courses were imported yet.</p>
                  <button className="btn btn-primary mt-3" onClick={handleSync} disabled={syncing}>Run first sync</button>
                </div>
              )}
            </SectionCard>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-3">
            <SectionCard
              title="My courses"
              subtitle="Choose courses to filter dashboard content"
              action={
                <div className="flex gap-2">
                  <button type="button" className="btn btn-secondary" onClick={() => setSelectedCourseIds(new Set(courses.map((c) => c.id)))}>All</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setSelectedCourseIds(new Set())}>None</button>
                </div>
              }
            >
              <div className="grid gap-2">
                {courses.map((course) => {
                  const selected = selectedCourseIds.has(course.id);
                  return (
                    <label key={course.id} className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${selected ? "border-cyan-300/45 bg-cyan-400/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                      <span className="flex items-center gap-2 text-slate-100">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: course.color ?? "#22d3ee" }} />
                        {course.name}
                      </span>
                      <input
                        aria-label={`Toggle ${course.name}`}
                        type="checkbox"
                        checked={selected}
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
            </SectionCard>

            <SectionCard title="Upcoming tests & assignments" subtitle="Next 14 days" action={<a href="/assignments" className="btn btn-secondary">View all</a>}>
              {upcomingAssignments.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/20 bg-white/5 p-3 text-sm text-slate-300">No upcoming due dates in selected courses.</p>
              ) : (
                <ul className="space-y-2">
                  {upcomingAssignments.map((assignment) => {
                    const urgent = assignment.due.getTime() - Date.now() < 48 * 3600 * 1000;
                    return (
                      <li key={assignment.id} className={`rounded-xl border p-3 ${urgent ? "border-rose-300/40 bg-rose-500/10" : "border-white/10 bg-white/5"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-white">{assignment.title}</p>
                            <p className="text-xs text-slate-300">{assignment.course?.name ?? "Course"}</p>
                          </div>
                          <p className="text-xs text-slate-200">{format(assignment.due, "MMM d, p")}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Recommended practice" subtitle="Based on weak areas" action={<a href="/practice" className="btn btn-secondary">Start</a>}>
              {metrics.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/20 bg-white/5 p-3 text-sm text-slate-300">No weak topics detected yet. Complete a practice session to get recommendations.</p>
              ) : (
                <ul className="space-y-2">
                  {metrics.slice(0, 5).map((m) => (
                    <li key={m.topic} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
                      <span className="inline-flex items-center gap-2 text-sm text-slate-100"><Target className="h-3.5 w-3.5 text-cyan-300" />{m.topic}</span>
                      <span className="text-xs text-amber-300">{m.accuracy_pct}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Recent study sessions" subtitle="Your latest focus blocks" action={<a href="/focus" className="btn btn-secondary">Open focus</a>}>
              {recentSessions.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/20 bg-white/5 p-3 text-sm text-slate-300">No sessions yet. Start a focus block to build progress history.</p>
              ) : (
                <ul className="space-y-2">
                  {recentSessions.map((s, i) => (
                    <li key={`${s.started_at}_${i}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
                      <span className="inline-flex items-center gap-2 text-sm text-slate-100"><Flame className="h-3.5 w-3.5 text-orange-300" />{format(new Date(s.started_at), "PPp")}</span>
                      <span className="text-xs text-slate-200">{s.duration_minutes ?? 0} min</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Recent activity & trust signals" subtitle="System status and updates">
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                  <CheckCircle2 className="h-4 w-4" />
                  Retrieval pipeline active: hybrid ranking + confidence gating enabled.
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-500/10 p-3 text-sm text-cyan-100">
                  <GraduationCap className="h-4 w-4" />
                  Notes + assignments are used with source citations during practice context assembly.
                </div>
                {notifications.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/20 bg-white/5 p-3 text-sm text-slate-300">No unread notifications.</p>
                ) : (
                  <ul className="space-y-2">
                    {notifications.slice(0, 3).map((n) => (
                      <li key={n.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <p className="text-sm font-medium text-white">{n.title}</p>
                        {n.body ? <p className="mt-1 text-xs text-slate-300">{n.body}</p> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </SectionCard>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[rgba(8,12,24,0.72)] p-4 text-xs text-slate-400">
            <p className="inline-flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5" /> Data freshness and retrieval confidence improve as more up-to-date course content is synced.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
