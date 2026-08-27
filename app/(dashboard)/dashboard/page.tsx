"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Command,
  FileStack,
  Flame,
  GraduationCap,
  Link2,
  MessageCircleQuestion,
  Radio,
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
      className={`rounded-[1.65rem] border border-white/[0.075] bg-[linear-gradient(145deg,rgba(10,15,29,0.9),rgba(5,9,19,0.82))] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-6 ${className}`}
    >
      <div className="mb-5 flex items-start justify-between gap-4 sm:mb-6">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-white sm:text-base">{title}</h2>
          {subtitle ? <p className="mt-1.5 max-w-xl text-xs leading-5 text-slate-500">{subtitle}</p> : null}
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
      className="group relative flex min-h-14 items-center gap-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3 text-sm font-medium text-slate-200 transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-300/25 hover:bg-sky-400/[0.07] hover:text-white"
    >
      <span className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/0 to-transparent transition-all duration-300 group-hover:via-sky-300/70" />
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-sky-300/10 bg-sky-300/[0.06] text-sky-300 transition-colors group-hover:border-sky-300/25 group-hover:bg-sky-300/[0.1]">
        {icon}
      </span>
      <span>{label}</span>
      <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-slate-600 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-sky-300" />
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
        title: "Connect Canvas to rank what matters next.",
        description: "Import current courses, deadlines, and class materials so Smartlearn can surface the work that needs your attention.",
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
        secondaryHref: "/assignments",
        secondaryLabel: "Review deadlines",
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
      glow: "bg-orange-400/15",
      badge: "border-orange-300/25 bg-orange-400/10 text-orange-100",
      dot: "bg-orange-300 shadow-[0_0_16px_rgba(253,186,116,0.75)]",
    },
    focus: {
      border: "border-sky-300/20",
      glow: "bg-sky-400/15",
      badge: "border-sky-300/25 bg-sky-400/10 text-sky-100",
      dot: "bg-sky-300 shadow-[0_0_16px_rgba(125,211,252,0.75)]",
    },
    clear: {
      border: "border-emerald-300/20",
      glow: "bg-emerald-400/15",
      badge: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
      dot: "bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.75)]",
    },
  }[primaryAction.tone];

  const canvasUpdatedLabel = canvasConnection?.last_synced_at
    ? formatDistanceToNowStrict(parseISO(canvasConnection.last_synced_at), { addSuffix: true })
    : "Not synced yet";
  const courseSignalPositions = [
    "left-[8%] top-[54%]",
    "left-[28%] top-[12%]",
    "right-[27%] top-[17%]",
    "right-[8%] top-[56%]",
    "left-[45%] bottom-[4%]",
  ];
  const weeklyMetrics = [
    {
      icon: <CalendarDays className="h-4 w-4" />,
      label: "Due in 7 days",
      value: String(upcomingAssignments.length),
      note: urgentAssignments.length > 0 ? `${urgentAssignments.length} urgent` : "No urgent deadlines",
      tone: "border-orange-300/15 bg-orange-300/[0.06] text-orange-200",
      line: "via-orange-300/70",
    },
    {
      icon: <Flame className="h-4 w-4" />,
      label: "Study streak",
      value: `${studyStreak} ${studyStreak === 1 ? "day" : "days"}`,
      note: studyStreak > 0 ? "Momentum active" : "Start with one session",
      tone: "border-violet-300/15 bg-violet-300/[0.06] text-violet-200",
      line: "via-violet-300/70",
    },
    {
      icon: <Clock3 className="h-4 w-4" />,
      label: "Focus this week",
      value: `${hoursThisWeek} hrs`,
      note: "Completed sessions only",
      tone: "border-sky-300/15 bg-sky-300/[0.06] text-sky-200",
      line: "via-sky-300/70",
    },
    {
      icon: <FileStack className="h-4 w-4" />,
      label: "Indexed material",
      value: String(notesCount),
      note: `${courses.length} active course${courses.length === 1 ? "" : "s"}`,
      tone: "border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-200",
      line: "via-emerald-300/70",
    },
  ];

  return (
    <div className="mx-auto max-w-[1440px] pb-20 pt-1" data-dashboard-command-center>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-30 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300/80" />
            </span>
            {format(new Date(), "EEEE · MMMM d")} · Live semester
          </div>
          <h1 className="mt-2.5 text-[clamp(1.8rem,4vw,2.65rem)] font-semibold leading-none tracking-[-0.045em] text-white">
            {greeting}{firstName ? `, ${firstName}` : ""}.
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {urgentAssignments.length > 0
              ? `${urgentAssignments.length} deadline${urgentAssignments.length === 1 ? " needs" : "s need"} attention within 48 hours.`
              : upcomingAssignments.length > 0
                ? `${upcomingAssignments.length} item${upcomingAssignments.length === 1 ? " is" : "s are"} due in the next 7 days.`
                : "Your next seven days are clear."}
          </p>
        </div>

        <div className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-2 pl-3.5 sm:w-auto sm:justify-end">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-600">
              <Radio className="h-3 w-3 text-emerald-300/70" aria-hidden="true" />
              Canvas signal
            </p>
            <p className="mt-0.5 max-w-36 truncate text-xs text-slate-300">
              {canvasConnection ? canvasUpdatedLabel : "Not connected"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || !canvasConnection}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 text-xs font-semibold text-slate-100 transition-all hover:border-sky-300/25 hover:bg-sky-300/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} aria-hidden="true" />
            {syncing ? "Syncing" : "Sync now"}
          </button>
        </div>
      </header>

      {syncMessage ? (
        <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-xs text-slate-300" role="status">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden="true" />
          {syncMessage}
        </div>
      ) : null}

      {loadState === "loading" ? (
        <div className="space-y-4" role="status" aria-label="Loading dashboard">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
            <SkeletonBlock className="h-[350px]" />
            <SkeletonBlock className="h-[350px]" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => <SkeletonBlock key={item} className="h-28" />)}
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
            <SkeletonBlock className="h-80" />
            <SkeletonBlock className="h-80" />
          </div>
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="rounded-[1.65rem] border border-red-300/20 bg-red-400/[0.06] p-8 text-center">
          <p className="mb-4 text-sm text-slate-300">{syncMessage ?? "Failed to load your dashboard."}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" className="btn btn-primary" onClick={() => loadDashboardData()}>Retry</button>
            <Link href="/settings" className="btn btn-secondary">Settings</Link>
          </div>
        </div>
      ) : null}

      {loadState === "ready" ? (
        <div className="space-y-4 sm:space-y-5">
          <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
            <section
              className={`relative overflow-hidden rounded-[1.8rem] border ${primaryTone.border} bg-[linear-gradient(145deg,rgba(10,18,36,0.97),rgba(5,10,23,0.94))] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.32)] sm:p-7`}
              data-dashboard-primary-action
            >
              <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(125,211,252,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(125,211,252,0.045)_1px,transparent_1px)] [background-size:32px_32px]" />
              <div className={`pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full ${primaryTone.glow} blur-[90px]`} />

              <div className="relative grid h-full gap-6 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-stretch">
                <div className="flex min-w-0 flex-col">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] ${primaryTone.badge}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${primaryTone.dot}`} />
                      {primaryAction.badge}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      <Command className="h-3 w-3" aria-hidden="true" />
                      Priority 01
                    </span>
                  </div>

                  <div className="py-7 sm:py-9">
                    <h2 className="max-w-2xl text-[clamp(1.7rem,4.2vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
                      {primaryAction.title}
                    </h2>
                    <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-[15px]">
                      {primaryAction.description}
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {primaryAction.meta.map((item) => (
                        <span key={item} className="rounded-full border border-white/[0.08] bg-black/15 px-3 py-1.5 text-[11px] font-medium text-slate-300">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-auto flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
                    <Link
                      href={primaryAction.href}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-sky-100/40 bg-gradient-to-r from-white to-sky-100 px-5 text-sm font-bold text-slate-950 shadow-[0_14px_40px_rgba(56,189,248,0.14)] transition-all hover:-translate-y-0.5 hover:to-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                    >
                      {primaryAction.cta}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    {primaryAction.secondaryHref ? (
                      <Link
                        href={primaryAction.secondaryHref}
                        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] px-5 text-sm font-semibold text-slate-200 transition-colors hover:border-white/20 hover:bg-white/[0.075] hover:text-white"
                      >
                        {primaryAction.secondaryLabel}
                      </Link>
                    ) : null}
                  </div>
                </div>

                <aside className="relative overflow-hidden rounded-[1.3rem] border border-white/[0.08] bg-black/20 p-4 backdrop-blur-xl" aria-label="Live semester pulse">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">Live semester</p>
                      <p className="mt-1 text-xs font-medium text-slate-300">Current workload</p>
                    </div>
                    <Activity className="h-4 w-4 text-sky-300/80" aria-hidden="true" />
                  </div>

                  <dl className="mt-5 grid grid-cols-3 gap-2 border-y border-white/[0.07] py-4 lg:grid-cols-1 lg:gap-3 lg:border-b-0">
                    {[
                      ["7-day load", upcomingAssignments.length],
                      ["Urgent", urgentAssignments.length],
                      ["Focus hrs", hoursThisWeek],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0 lg:flex lg:items-baseline lg:justify-between lg:gap-3">
                        <dt className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-600">{label}</dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums text-white lg:mt-0 lg:text-base">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="relative mt-2 hidden h-24 lg:block" aria-hidden="true">
                    <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-300/10" />
                    <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-300/15" />
                    <div className="absolute left-1/2 top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-sky-300/20 bg-sky-300/[0.08]">
                      <Zap className="h-3 w-3 text-sky-200" />
                    </div>
                    {courses.slice(0, 5).map((course, index) => (
                      <span
                        key={course.id}
                        className={`absolute h-2 w-2 rounded-full ring-4 ring-white/[0.025] ${courseSignalPositions[index]}`}
                        style={{ backgroundColor: course.color ?? "#7dd3fc" }}
                      />
                    ))}
                  </div>
                  <p className="mt-3 text-center text-[10px] text-slate-600 lg:mt-0">
                    {courses.length} active course{courses.length === 1 ? "" : "s"} in signal
                  </p>
                </aside>
              </div>
            </section>

            <Panel
              title="Deadline queue"
              subtitle="Your next four commitments, ordered by due time"
              action={(
                <Link href="/assignments" className="inline-flex items-center gap-1 text-xs font-semibold text-sky-300 hover:text-sky-200">
                  View all <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
              className="h-full"
            >
              {upcomingAssignments.length === 0 ? (
                <div className="grid min-h-[230px] place-items-center text-center">
                  <div>
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-300/70" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-slate-200">No deadlines this week</p>
                    <p className="mt-1 text-xs text-slate-500">Your active courses are clear for seven days.</p>
                  </div>
                </div>
              ) : (
                <ol className="divide-y divide-white/[0.065]">
                  {upcomingAssignments.slice(0, 4).map((assignment) => {
                    const urgent = assignment.due.getTime() - nowMs < 48 * HOUR_MS;
                    return (
                      <li key={assignment.id}>
                        <Link
                          href={assignmentHref(assignment.id)}
                          className="group grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 py-3.5 first:pt-0 last:pb-0"
                        >
                          <span className={`grid h-11 w-11 place-items-center rounded-xl border text-center ${urgent ? "border-orange-300/20 bg-orange-300/[0.08]" : "border-white/[0.07] bg-white/[0.035]"}`}>
                            <span>
                              <span className={`block text-[8px] font-bold uppercase tracking-[0.14em] ${urgent ? "text-orange-300" : "text-slate-600"}`}>{format(assignment.due, "MMM")}</span>
                              <span className="mt-0.5 block text-sm font-semibold leading-none text-slate-100">{format(assignment.due, "d")}</span>
                            </span>
                          </span>
                          <span className="min-w-0">
                            <span className="line-clamp-2 text-sm font-medium leading-5 text-slate-100 transition-colors group-hover:text-white">{assignment.title}</span>
                            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-slate-500">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: assignment.course?.color ?? "#7dd3fc" }} />
                              <span className="truncate">{assignment.course?.name ?? "Course"}</span>
                            </span>
                          </span>
                          <span className="flex items-center gap-2 pl-1">
                            <span className={`hidden whitespace-nowrap text-[10px] font-semibold 2xl:block ${urgent ? "text-orange-200" : "text-slate-500"}`}>
                              {deadlineLabel(assignment.due, nowMs)}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 text-slate-700 transition-all group-hover:translate-x-0.5 group-hover:text-sky-300" aria-hidden="true" />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>
          </div>

          <section aria-label="Weekly pulse" className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {weeklyMetrics.map((metric) => (
              <div key={metric.label} className="group relative overflow-hidden rounded-[1.3rem] border border-white/[0.07] bg-[rgba(7,11,22,0.76)] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.12] hover:bg-[rgba(10,16,30,0.88)]">
                <span className={`pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent ${metric.line} to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
                <div className="flex items-center gap-3.5">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${metric.tone}`}>{metric.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-600">{metric.label}</p>
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <strong className="text-lg font-semibold tabular-nums tracking-[-0.02em] text-white">{metric.value}</strong>
                      <span className="text-[10px] text-slate-500">{metric.note}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
            <Panel
              title="Study priorities"
              subtitle="Smartlearn ranks these from real deadlines and demonstrated mastery"
              action={<Link href="/practice" className="text-xs font-semibold text-sky-300 hover:text-sky-200">Practice weak spots</Link>}
            >
              {recommendations.length === 0 ? (
                <div className="flex min-h-48 flex-col items-center justify-center text-center">
                  <Target className="h-8 w-8 text-slate-600" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-slate-300">No study priorities yet</p>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">Complete a practice session so Smartlearn can rank your strongest next move.</p>
                  <button type="button" className="btn btn-secondary mt-4" onClick={handleSync} disabled={syncing || !canvasConnection}>
                    {canvasConnection ? "Refresh course data" : "Connect Canvas first"}
                  </button>
                </div>
              ) : (
                <ol className="space-y-2.5">
                  {recommendations.slice(0, 3).map((recommendation, index) => {
                    const priorityTone = [
                      {
                        border: "border-sky-300/20 hover:border-sky-300/35",
                        surface: "bg-sky-400/[0.055] hover:bg-sky-400/[0.085]",
                        rank: "border-sky-300/20 bg-sky-300/10 text-sky-200",
                        action: "text-sky-200",
                      },
                      {
                        border: "border-violet-300/15 hover:border-violet-300/30",
                        surface: "bg-violet-400/[0.035] hover:bg-violet-400/[0.065]",
                        rank: "border-violet-300/15 bg-violet-300/[0.08] text-violet-200",
                        action: "text-violet-200",
                      },
                      {
                        border: "border-cyan-300/15 hover:border-cyan-300/30",
                        surface: "bg-cyan-400/[0.03] hover:bg-cyan-400/[0.06]",
                        rank: "border-cyan-300/15 bg-cyan-300/[0.08] text-cyan-200",
                        action: "text-cyan-200",
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
                          className={`group grid gap-3 rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center ${priorityTone.border} ${priorityTone.surface}`}
                        >
                          <span className={`grid h-10 w-10 place-items-center rounded-xl border text-[10px] font-bold tracking-[0.1em] ${priorityTone.rank}`}>
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="min-w-0">
                            {recommendation.course_name ? (
                              <span className="line-clamp-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">{recommendation.course_name}</span>
                            ) : null}
                            <strong className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-white sm:text-[15px]">{recommendation.topic}</strong>
                            <span className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{recommendation.reason}</span>
                          </span>
                          <span className="flex items-center gap-3 pl-[3.25rem] sm:flex-col sm:items-end sm:gap-2 sm:pl-0">
                            <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold ${accuracyTone}`}>{accuracyLabel}</span>
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${priorityTone.action}`}>
                              Practice <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>

            <Panel title="Quick launch" subtitle="Go directly to the learning tool you need">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <QuickTool href="/practice" icon={<Target className="h-4 w-4" />} label="Practice" />
                <QuickTool href="/notes" icon={<BookOpen className="h-4 w-4" />} label="Study guide" />
                <QuickTool href="/flashcards" icon={<Sparkles className="h-4 w-4" />} label="Flashcards" />
                <QuickTool href="/chat" icon={<MessageCircleQuestion className="h-4 w-4" />} label="Ask Smartlearn" />
              </div>

              <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/15 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-slate-600">Workspace health</p>
                  <span className={`h-2 w-2 rounded-full ${canvasConnection ? "bg-emerald-300" : "bg-orange-300"}`} />
                </div>
                <dl className="mt-3 space-y-3 text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="flex items-center gap-2 text-slate-500"><Link2 className="h-3.5 w-3.5" /> Canvas</dt>
                    <dd className={canvasConnection ? "text-emerald-300" : "text-orange-200"}>{canvasConnection ? "Connected" : "Not connected"}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="flex items-center gap-2 text-slate-500"><GraduationCap className="h-3.5 w-3.5" /> Active courses</dt>
                    <dd className="tabular-nums text-slate-300">{courses.length}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="flex items-center gap-2 text-slate-500"><FileStack className="h-3.5 w-3.5" /> Indexed material</dt>
                    <dd className="tabular-nums text-slate-300">{notesCount} items</dd>
                  </div>
                </dl>
              </div>
            </Panel>
          </div>

          <Panel
            title="Active courses"
            subtitle="Course signals include only currently active Canvas classes and real upcoming work"
            action={<Link href="/courses" className="inline-flex items-center gap-1 text-xs font-semibold text-sky-300 hover:text-sky-200">All courses <ArrowUpRight className="h-3.5 w-3.5" /></Link>}
          >
            {courses.length === 0 ? (
              <div className="flex flex-col items-center py-7 text-center">
                <GraduationCap className="h-7 w-7 text-slate-600" aria-hidden="true" />
                <p className="mt-2 text-sm text-slate-400">No active courses are synced.</p>
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                {courses.slice(0, 6).map((course) => {
                  const courseDeadlines = upcomingAssignments.filter((assignment) => assignment.course?.id === course.id);
                  const nextDeadline = courseDeadlines[0];
                  return (
                    <Link
                      key={course.id}
                      href={`/courses/${course.id}`}
                      className="group relative min-w-0 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.045]"
                    >
                      <span className="absolute inset-x-0 top-0 h-px opacity-75" style={{ backgroundColor: course.color ?? "#7dd3fc" }} />
                      <div className="flex items-start gap-3">
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_12px_currentColor]" style={{ backgroundColor: course.color ?? "#7dd3fc", color: course.color ?? "#7dd3fc" }} />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-100">{course.name}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                            <span>{courseDeadlines.length} due this week</span>
                            <span className="h-1 w-1 rounded-full bg-slate-700" />
                            <span>{nextDeadline ? deadlineLabel(nextDeadline.due, nowMs) : "Schedule clear"}</span>
                          </div>
                        </div>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-700 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-sky-300" aria-hidden="true" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Panel>

          {unreadNotifications.length > 0 ? (
            <Panel title="Updates" subtitle="Unread information that may affect your plan">
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {unreadNotifications.slice(0, 3).map((notification) => (
                  <li key={notification.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                    <p className="text-sm font-medium text-white">{notification.title}</p>
                    {notification.body ? <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-slate-500">{notification.body}</p> : null}
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
