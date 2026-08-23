"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileStack,
  Flame,
  GraduationCap,
  Link2,
  MessageCircleQuestion,
  RefreshCw,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";

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
type PracticeActivity = { created_at: string };
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
type PrimaryAction = {
  badge: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  tone: "urgent" | "focus" | "clear";
  meta: string[];
};

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[1.4rem] border border-white/[0.08] bg-[rgba(8,12,24,0.78)] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.22)] backdrop-blur sm:p-6 ${className}`}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-[-0.02em] text-white sm:text-lg">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`skeleton-shimmer rounded-[1.4rem] ${className}`} aria-hidden="true" />;
}

function QuickTool({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-12 items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-sky-300/25 hover:bg-sky-400/[0.07] hover:text-white"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.04] text-sky-300">
        {icon}
      </span>
      <span>{label}</span>
      <ArrowRight className="ml-auto h-3.5 w-3.5 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-sky-300" />
    </Link>
  );
}

function deadlineLabel(due: Date, nowMs: number): string {
  const difference = due.getTime() - nowMs;
  if (difference <= HOUR_MS) return "Due within 1 hour";
  if (difference < 24 * HOUR_MS) return `Due in ${Math.max(1, Math.ceil(difference / HOUR_MS))}h`;
  if (difference < 48 * HOUR_MS) return "Due tomorrow";
  return format(due, "EEE, MMM d");
}

function assignmentHref(assignmentId: string): string {
  return `/assignments?assignmentId=${encodeURIComponent(assignmentId)}`;
}

export default function DashboardPage() {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [connections, setConnections] = useState<LmsConnection[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [practiceActivity, setPracticeActivity] = useState<PracticeActivity[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notesCount, setNotesCount] = useState(0);
  const [loadState, setLoadState] = useState<DashboardLoadState>("loading");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  async function loadDashboardData(showLoading = true) {
    if (showLoading) setLoadState("loading");
    try {
      const [aR, cR, crR, pR, fR, prR, nR, ntsR, recR] = await Promise.all([
        fetch("/api/assignments"),
        fetch("/api/lms/connections"),
        fetch("/api/courses"),
        fetch("/api/profile"),
        fetch("/api/focus/history"),
        fetch("/api/practice/history"),
        fetch("/api/notifications"),
        fetch("/api/notes/list"),
        fetch("/api/study/recommendations"),
      ]);
      if (!aR.ok || !cR.ok || !crR.ok) throw new Error("Could not load your dashboard.");
      const [aD, cD, crD, pD, fD, prD, nD, ntsD, recD] = await Promise.all([
        aR.json(),
        cR.json(),
        crR.json(),
        pR.ok ? pR.json() : null,
        fR.ok ? fR.json() : [],
        prR.ok ? prR.json() : [],
        nR.ok ? nR.json() : [],
        ntsR.ok ? ntsR.json() : [],
        recR.ok ? recR.json() : [],
      ]);
      setAssignments(Array.isArray(aD) ? aD : []);
      setConnections(Array.isArray(cD) ? cD : []);
      setCourses(Array.isArray(crD) ? crD : []);
      setProfile(pD);
      setFocusSessions(Array.isArray(fD) ? fD : []);
      setPracticeActivity(Array.isArray(prD) ? prD : []);
      setRecommendations(Array.isArray(recD) ? recD : []);
      setNotifications(Array.isArray(nD) ? nD : []);
      setNotesCount(Array.isArray(ntsD) ? ntsD.length : 0);
      setLoadState("ready");
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Failed to load your dashboard.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    void loadDashboardData();
    const handleSyncComplete = () => void loadDashboardData(false);
    window.addEventListener("smartlearn:sync-complete", handleSyncComplete);
    return () => window.removeEventListener("smartlearn:sync-complete", handleSyncComplete);
  }, []);

  const canvasConnection = connections.find((connection) => connection.platform === "canvas" && connection.is_active);

  const upcomingAssignments = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + 7 * DAY_MS);
    return assignments
      .filter((assignment) => assignment.due_date && !assignment.is_completed)
      .map((assignment) => ({ ...assignment, due: parseISO(assignment.due_date as string) }))
      .filter((assignment) => assignment.due >= now && assignment.due <= cutoff)
      .sort((a, b) => a.due.getTime() - b.due.getTime());
  }, [assignments]);

  const hoursThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * DAY_MS;
    const minutes = focusSessions
      .filter((session) => new Date(session.started_at).getTime() >= weekAgo)
      .reduce((total, session) => total + (session.duration_minutes ?? 0), 0);
    return Math.round((minutes / 60) * 10) / 10;
  }, [focusSessions]);

  const studyStreak = useMemo(() => {
    const days = new Set([
      ...focusSessions.map((session) => format(new Date(session.started_at), "yyyy-MM-dd")),
      ...practiceActivity.map((session) => format(new Date(session.created_at), "yyyy-MM-dd")),
    ]);
    let streak = 0;
    for (let index = 0; index < 60; index += 1) {
      const key = format(new Date(Date.now() - index * DAY_MS), "yyyy-MM-dd");
      if (!days.has(key)) break;
      streak += 1;
    }
    return streak;
  }, [focusSessions, practiceActivity]);

  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => !notification.read_at),
    [notifications]
  );

  const nowMs = Date.now();
  const urgentAssignments = upcomingAssignments.filter(
    (assignment) => assignment.due.getTime() - nowMs < 48 * HOUR_MS
  );
  const topRecommendation = recommendations[0] ?? null;
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const primaryAction: PrimaryAction = useMemo(() => {
    if (!canvasConnection) {
      return {
        badge: "Start here",
        title: "Connect Canvas to build your study plan.",
        description: "Import current courses, deadlines, and class materials so Smartlearn can rank what matters next.",
        href: "/settings/setup/canvas",
        cta: "Connect Canvas",
        tone: "focus",
        meta: ["About 2 minutes", "Secure token setup"],
      };
    }

    const urgent = urgentAssignments[0];
    if (urgent) {
      return {
        badge: "Most urgent",
        title: urgent.title,
        description: `${urgent.course?.name ?? "Course"} is your closest deadline. Review the instructions now, then decide what support you need.`,
        href: assignmentHref(urgent.id),
        cta: "Open assignment",
        secondaryHref: urgent.course?.id ? `/practice?courseId=${urgent.course.id}` : "/practice",
        secondaryLabel: "Practice first",
        tone: "urgent",
        meta: [deadlineLabel(urgent.due, nowMs), format(urgent.due, "MMM d · p")],
      };
    }

    if (topRecommendation) {
      return {
        badge: "Best study move",
        title: topRecommendation.topic,
        description: topRecommendation.reason,
        href: `/practice${topRecommendation.course_id ? `?courseId=${topRecommendation.course_id}` : ""}`,
        cta: "Start targeted practice",
        secondaryHref: "/study",
        secondaryLabel: "View study plan",
        tone: "focus",
        meta: [
          topRecommendation.course_name ?? "Across your courses",
          topRecommendation.accuracy_pct === null
            ? "Baseline not tested"
            : `${topRecommendation.accuracy_pct}% current accuracy`,
        ],
      };
    }

    const nextAssignment = upcomingAssignments[0];
    if (nextAssignment) {
      return {
        badge: "Next deadline",
        title: nextAssignment.title,
        description: `Get ahead on ${nextAssignment.course?.name ?? "your next course task"} before it becomes urgent.`,
        href: assignmentHref(nextAssignment.id),
        cta: "Review assignment",
        secondaryHref: "/assignments",
        secondaryLabel: "All assignments",
        tone: "focus",
        meta: [deadlineLabel(nextAssignment.due, nowMs), format(nextAssignment.due, "MMM d · p")],
      };
    }

    return {
      badge: "All clear",
      title: "No deadlines need your attention this week.",
      description: "Use the open time to strengthen a course topic, organize notes, or build your next study session.",
      href: "/practice",
      cta: "Choose a practice topic",
      secondaryHref: "/notes",
      secondaryLabel: "Organize notes",
      tone: "clear",
      meta: [`${courses.length} active course${courses.length === 1 ? "" : "s"}`, "7-day view is clear"],
    };
  }, [canvasConnection, courses.length, nowMs, topRecommendation, upcomingAssignments, urgentAssignments]);

  async function handleSync() {
    setSyncMessage(null);
    setSyncing(true);
    try {
      const response = await fetch("/api/sync/all?mode=quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (!response.ok || data?.success === false) {
        setSyncMessage(data?.error || data?.errors?.[0] || "Sync failed. Check your LMS connection.");
      } else {
        setSyncMessage("Sync complete — your priorities are current.");
        await loadDashboardData(false);
      }
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  const primaryTone = {
    urgent: {
      border: "border-orange-300/25",
      glow: "bg-orange-400/10",
      badge: "border-orange-300/25 bg-orange-400/10 text-orange-200",
      icon: "text-orange-200",
    },
    focus: {
      border: "border-sky-300/20",
      glow: "bg-sky-400/10",
      badge: "border-sky-300/25 bg-sky-400/10 text-sky-200",
      icon: "text-sky-200",
    },
    clear: {
      border: "border-emerald-300/20",
      glow: "bg-emerald-400/10",
      badge: "border-emerald-300/25 bg-emerald-400/10 text-emerald-200",
      icon: "text-emerald-200",
    },
  }[primaryAction.tone];

  return (
    <div className="mx-auto max-w-[1320px] px-4 pb-20 pt-5 sm:px-6 sm:pt-7">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            {format(new Date(), "EEEE · MMMM d")}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-white sm:text-[2rem]">
            {greeting}{firstName ? `, ${firstName}` : ""}.
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            {urgentAssignments.length > 0
              ? `${urgentAssignments.length} deadline${urgentAssignments.length === 1 ? " needs" : "s need"} attention within 48 hours.`
              : upcomingAssignments.length > 0
                ? `${upcomingAssignments.length} item${upcomingAssignments.length === 1 ? " is" : "s are"} due in the next 7 days.`
                : "Your next seven days are clear."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canvasConnection ? (
            <p className="hidden text-right text-[11px] leading-4 text-slate-600 md:block">
              Canvas updated<br />
              {canvasConnection.last_synced_at
                ? formatDistanceToNowStrict(parseISO(canvasConnection.last_synced_at), { addSuffix: true })
                : "not yet synced"}
            </p>
          ) : null}
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || !canvasConnection}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 text-xs font-semibold text-slate-200 transition-colors hover:border-white/20 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} aria-hidden="true" />
            {syncing ? "Syncing" : "Sync now"}
          </button>
        </div>
      </header>

      {syncMessage ? (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-xs text-slate-300" role="status">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden="true" />
          {syncMessage}
        </div>
      ) : null}

      {loadState === "loading" ? (
        <div className="space-y-5" role="status" aria-label="Loading dashboard">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <SkeletonBlock className="h-[330px]" />
            <SkeletonBlock className="h-[330px]" />
          </div>
          <SkeletonBlock className="h-24" />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <SkeletonBlock className="h-80" />
            <SkeletonBlock className="h-80" />
          </div>
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="rounded-[1.4rem] border border-red-300/20 bg-red-400/[0.06] p-8 text-center">
          <p className="mb-4 text-sm text-slate-300">{syncMessage ?? "Failed to load your dashboard."}</p>
          <div className="flex justify-center gap-3">
            <button type="button" className="btn btn-primary" onClick={() => loadDashboardData()}>Retry</button>
            <Link href="/settings" className="btn btn-secondary">Settings</Link>
          </div>
        </div>
      ) : null}

      {loadState === "ready" ? (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <section className={`relative min-h-[330px] overflow-hidden rounded-[1.6rem] border ${primaryTone.border} bg-[rgba(8,13,27,0.9)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8`}>
              <div className={`pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full ${primaryTone.glow} blur-3xl`} />
              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between gap-4">
                  <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] ${primaryTone.badge}`}>
                    <Zap className="h-3 w-3" aria-hidden="true" />
                    {primaryAction.badge}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Priority 01</span>
                </div>

                <div className="my-auto py-8">
                  <h2 className="max-w-2xl text-2xl font-semibold leading-[1.15] tracking-[-0.04em] text-white sm:text-3xl lg:text-[2.25rem]">
                    {primaryAction.title}
                  </h2>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-[15px]">
                    {primaryAction.description}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {primaryAction.meta.map((item) => (
                      <span key={item} className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[11px] font-medium text-slate-300">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Link href={primaryAction.href} className="btn btn-primary !inline-flex !items-center !gap-2">
                    {primaryAction.cta}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  {primaryAction.secondaryHref ? (
                    <Link href={primaryAction.secondaryHref} className="btn btn-secondary !inline-flex !items-center !gap-2">
                      {primaryAction.secondaryLabel}
                    </Link>
                  ) : null}
                </div>
              </div>
            </section>

            <Panel
              title="Deadline queue"
              subtitle="The next commitments that can change your week"
              action={<Link href="/assignments" className="text-xs font-semibold text-sky-300 hover:text-sky-200">View all</Link>}
              className="min-h-[330px]"
            >
              {upcomingAssignments.length === 0 ? (
                <div className="grid min-h-[210px] place-items-center text-center">
                  <div>
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-300/70" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-slate-200">No deadlines this week</p>
                    <p className="mt-1 text-xs text-slate-500">Your active courses are clear for seven days.</p>
                  </div>
                </div>
              ) : (
                <ol className="space-y-2">
                  {upcomingAssignments.slice(0, 4).map((assignment, index) => {
                    const urgent = assignment.due.getTime() - nowMs < 48 * HOUR_MS;
                    return (
                      <li key={assignment.id}>
                        <Link
                          href={assignmentHref(assignment.id)}
                          className={`group flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors ${
                            urgent
                              ? "border-orange-300/20 bg-orange-400/[0.07] hover:bg-orange-400/[0.1]"
                              : "border-white/[0.07] bg-white/[0.025] hover:border-white/[0.13] hover:bg-white/[0.045]"
                          }`}
                        >
                          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-semibold ${urgent ? "bg-orange-300/10 text-orange-200" : "bg-white/[0.05] text-slate-400"}`}>
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-100">{assignment.title}</span>
                            <span className="mt-0.5 block truncate text-[11px] text-slate-500">{assignment.course?.name ?? "Course"}</span>
                          </span>
                          <span className={`shrink-0 text-right text-[11px] font-semibold ${urgent ? "text-orange-200" : "text-slate-400"}`}>
                            {deadlineLabel(assignment.due, nowMs)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>
          </div>

          <section aria-label="Weekly progress" className="grid overflow-hidden rounded-[1.2rem] border border-white/[0.08] bg-[rgba(8,12,24,0.65)] sm:grid-cols-3">
            {[
              {
                icon: <CalendarDays className="h-4 w-4 text-orange-200" />,
                label: "Due in 7 days",
                value: String(upcomingAssignments.length),
                note: urgentAssignments.length > 0 ? `${urgentAssignments.length} urgent` : "No urgent deadlines",
              },
              {
                icon: <Flame className="h-4 w-4 text-violet-200" />,
                label: "Study streak",
                value: `${studyStreak} ${studyStreak === 1 ? "day" : "days"}`,
                note: studyStreak > 0 ? "Momentum active" : "Start with one session",
              },
              {
                icon: <Clock3 className="h-4 w-4 text-sky-200" />,
                label: "Focus this week",
                value: `${hoursThisWeek} hrs`,
                note: "Based on completed sessions",
              },
            ].map((metric, index) => (
              <div key={metric.label} className={`flex items-center gap-3 px-5 py-4 ${index > 0 ? "border-t border-white/[0.07] sm:border-l sm:border-t-0" : ""}`}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035]">{metric.icon}</span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">{metric.label}</p>
                  <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                    <strong className="text-base font-semibold text-white">{metric.value}</strong>
                    <span className="text-[11px] text-slate-500">{metric.note}</span>
                  </div>
                </div>
              </div>
            ))}
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <Panel
              title="Study priorities"
              subtitle="Ranked by deadline, grade impact, and your mastery gaps"
              action={<Link href="/study" className="text-xs font-semibold text-sky-300 hover:text-sky-200">Full plan</Link>}
            >
              {recommendations.length === 0 ? (
                <div className="flex min-h-52 flex-col items-center justify-center text-center">
                  <Target className="h-8 w-8 text-slate-600" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-slate-300">No study priorities yet</p>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">Sync Canvas, then complete practice so Smartlearn can rank your strongest next move.</p>
                  <button type="button" className="btn btn-secondary mt-4" onClick={handleSync} disabled={syncing || !canvasConnection}>
                    {canvasConnection ? "Sync Canvas" : "Connect Canvas first"}
                  </button>
                </div>
              ) : (
                <ol className="space-y-2.5">
                  {recommendations.slice(0, 4).map((recommendation, index) => {
                    const priorityTone = [
                      {
                        border: "border-sky-300/20 hover:border-sky-300/35",
                        surface: "bg-sky-400/[0.065] hover:bg-sky-400/[0.095]",
                        rank: "border-sky-300/20 bg-sky-300/10 text-sky-200",
                        action: "text-sky-200",
                      },
                      {
                        border: "border-violet-300/15 hover:border-violet-300/30",
                        surface: "bg-violet-400/[0.04] hover:bg-violet-400/[0.07]",
                        rank: "border-violet-300/15 bg-violet-300/[0.08] text-violet-200",
                        action: "text-violet-200",
                      },
                      {
                        border: "border-cyan-300/15 hover:border-cyan-300/30",
                        surface: "bg-cyan-400/[0.035] hover:bg-cyan-400/[0.065]",
                        rank: "border-cyan-300/15 bg-cyan-300/[0.08] text-cyan-200",
                        action: "text-cyan-200",
                      },
                      {
                        border: "border-white/[0.08] hover:border-emerald-300/25",
                        surface: "bg-white/[0.025] hover:bg-emerald-400/[0.045]",
                        rank: "border-white/[0.08] bg-white/[0.04] text-slate-400",
                        action: "text-emerald-200",
                      },
                    ][index];
                    const accuracyLabel = recommendation.accuracy_pct === null
                      ? "Baseline needed"
                      : `${recommendation.accuracy_pct}% mastery`;
                    const accuracyTone = recommendation.accuracy_pct === null
                      ? "border-white/[0.08] bg-white/[0.035] text-slate-400"
                      : recommendation.accuracy_pct < 60
                        ? "border-amber-300/20 bg-amber-300/[0.08] text-amber-200"
                        : "border-cyan-300/20 bg-cyan-300/[0.08] text-cyan-200";

                    return (
                      <li key={`${recommendation.topic}-${index}`}>
                        <Link
                          href={`/practice${recommendation.course_id ? `?courseId=${recommendation.course_id}` : ""}`}
                          className={`group grid gap-3 rounded-2xl border p-4 transition-colors sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center ${priorityTone.border} ${priorityTone.surface}`}
                        >
                          <span className={`grid h-9 w-9 place-items-center rounded-xl border text-[11px] font-bold tracking-[0.08em] ${priorityTone.rank}`}>
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="min-w-0">
                            {recommendation.course_name ? (
                              <span className="line-clamp-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                                {recommendation.course_name}
                              </span>
                            ) : null}
                            <strong className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-white sm:text-[15px]">
                              {recommendation.topic}
                            </strong>
                            <span className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-400">
                              {recommendation.reason}
                            </span>
                          </span>
                          <span className="flex items-center gap-3 pl-12 sm:flex-col sm:items-end sm:gap-2 sm:pl-0">
                            <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold ${accuracyTone}`}>
                              {accuracyLabel}
                            </span>
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${priorityTone.action}`}>
                              Practice
                              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>

            <Panel title="Quick tools" subtitle="Start a focused task without hunting through navigation">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <QuickTool href="/practice" icon={<Target className="h-4 w-4" />} label="Practice" />
                <QuickTool href="/notes" icon={<BookOpen className="h-4 w-4" />} label="Study guide" />
                <QuickTool href="/flashcards" icon={<Sparkles className="h-4 w-4" />} label="Flashcards" />
                <QuickTool href="/chat" icon={<MessageCircleQuestion className="h-4 w-4" />} label="Ask Smartlearn" />
              </div>

              <div className="mt-5 border-t border-white/[0.07] pt-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">Workspace health</p>
                <dl className="mt-3 space-y-3 text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="flex items-center gap-2 text-slate-500"><Link2 className="h-3.5 w-3.5" /> Canvas</dt>
                    <dd className={canvasConnection ? "text-emerald-300" : "text-orange-200"}>{canvasConnection ? "Connected" : "Not connected"}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="flex items-center gap-2 text-slate-500"><GraduationCap className="h-3.5 w-3.5" /> Active courses</dt>
                    <dd className="text-slate-300">{courses.length}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="flex items-center gap-2 text-slate-500"><FileStack className="h-3.5 w-3.5" /> Indexed material</dt>
                    <dd className="text-slate-300">{notesCount} items</dd>
                  </div>
                </dl>
              </div>
            </Panel>
          </div>

          <Panel
            title="Active courses"
            subtitle="Course detail lives here; the dashboard stays focused on decisions"
            action={<Link href="/courses" className="text-xs font-semibold text-sky-300 hover:text-sky-200">All courses</Link>}
          >
            {courses.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-center">
                <GraduationCap className="h-7 w-7 text-slate-600" aria-hidden="true" />
                <p className="mt-2 text-sm text-slate-400">No active courses are synced.</p>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {courses.slice(0, 6).map((course) => (
                  <Link
                    key={course.id}
                    href={`/courses/${course.id}`}
                    className="group flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-sm text-slate-200 transition-colors hover:border-white/[0.14] hover:bg-white/[0.045]"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: course.color ?? "#7dd3fc" }} />
                    <span className="min-w-0 flex-1 truncate">{course.name}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-300" />
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          {unreadNotifications.length > 0 ? (
            <Panel title="Updates" subtitle="Unread information that may affect your plan">
              <ul className="grid gap-2 md:grid-cols-3">
                {unreadNotifications.slice(0, 3).map((notification) => (
                  <li key={notification.id} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
                    <p className="text-sm font-medium text-white">{notification.title}</p>
                    {notification.body ? <p className="mt-1 text-xs leading-5 text-slate-500">{notification.body}</p> : null}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
