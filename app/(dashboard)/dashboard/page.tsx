"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
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
      className={`rounded-xl border border-white/[0.08] bg-white/[0.018] ${className}`}
      data-notion-surface
    >
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.065] px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-[-0.015em] text-slate-100">{title}</h2>
          {subtitle ? <p className="mt-1 max-w-xl text-[11px] leading-4 text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`skeleton-shimmer rounded-lg ${className}`} aria-hidden="true" />;
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
      className="group flex min-h-11 items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium text-slate-300 transition-colors hover:bg-white/[0.045] hover:text-white"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-sky-300/[0.08] text-sky-300 transition-colors group-hover:bg-sky-300/[0.14]">
        {icon}
      </span>
      <span>{label}</span>
      <ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-700 transition-transform group-hover:translate-x-0.5 group-hover:text-sky-300" />
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
      accent: "bg-orange-300",
      icon: "bg-orange-300/10 text-orange-200",
      label: "text-orange-200",
    },
    focus: {
      accent: "bg-sky-300",
      icon: "bg-sky-300/10 text-sky-200",
      label: "text-sky-200",
    },
    clear: {
      accent: "bg-emerald-300",
      icon: "bg-emerald-300/10 text-emerald-200",
      label: "text-emerald-200",
    },
  }[primaryAction.tone];

  const canvasUpdatedLabel = canvasConnection?.last_synced_at
    ? formatDistanceToNowStrict(parseISO(canvasConnection.last_synced_at), { addSuffix: true })
    : "Not synced yet";
  const weeklyMetrics = [
    {
      icon: <CalendarDays className="h-4 w-4" />,
      label: "Due in 7 days",
      value: String(upcomingAssignments.length),
      note: urgentAssignments.length > 0 ? `${urgentAssignments.length} urgent` : "No urgent deadlines",
      tone: urgentAssignments.length > 0
        ? "bg-orange-300/[0.08] text-orange-200"
        : "bg-sky-300/[0.08] text-sky-200",
      line: urgentAssignments.length > 0 ? "via-orange-300/70" : "via-sky-300/70",
    },
    {
      icon: <Flame className="h-4 w-4" />,
      label: "Study streak",
      value: `${studyStreak} ${studyStreak === 1 ? "day" : "days"}`,
      note: studyStreak > 0 ? "Momentum active" : "Start with one session",
      tone: "bg-sky-300/[0.08] text-sky-200",
      line: "via-sky-300/70",
    },
    {
      icon: <Clock3 className="h-4 w-4" />,
      label: "Focus this week",
      value: `${hoursThisWeek} hrs`,
      note: "Completed sessions only",
      tone: "bg-sky-300/[0.08] text-sky-200",
      line: "via-sky-300/70",
    },
    {
      icon: <FileStack className="h-4 w-4" />,
      label: "Indexed material",
      value: String(notesCount),
      note: `${courses.length} active course${courses.length === 1 ? "" : "s"}`,
      tone: "bg-sky-300/[0.08] text-sky-200",
      line: "via-sky-300/70",
    },
  ];

  return (
    <div
      className="mx-auto max-w-[1260px] pb-20"
      data-dashboard-command-center
      data-dashboard-notion-workspace
    >
      <header className="mb-6 border-b border-white/[0.07] pb-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-sky-300/20 bg-sky-300/[0.08] text-sky-200">
              <GraduationCap className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-500">{format(new Date(), "EEEE, MMMM d")}</p>
              <h1 className="mt-1 text-[clamp(1.75rem,4vw,2.35rem)] font-semibold leading-tight tracking-[-0.045em] text-white">
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
          </div>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <div className="min-w-0 text-right">
              <p className="flex items-center justify-end gap-1.5 text-[10px] font-medium text-slate-500">
                <span className={`h-1.5 w-1.5 rounded-full ${canvasConnection ? "bg-emerald-300" : "bg-orange-300"}`} />
                Canvas {canvasConnection ? "connected" : "not connected"}
              </p>
              <p className="mt-0.5 max-w-44 truncate text-[11px] text-slate-600">
                {canvasConnection ? `Updated ${canvasUpdatedLabel}` : "Connect Canvas to import classes"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing || !canvasConnection}
              className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 text-xs font-medium text-slate-200 transition-colors hover:border-sky-300/25 hover:bg-sky-300/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} aria-hidden="true" />
              {syncing ? "Syncing" : "Sync"}
            </button>
          </div>
        </div>
      </header>

      {syncMessage ? (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-xs text-slate-300" role="status" data-notion-surface>
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden="true" />
          {syncMessage}
        </div>
      ) : null}

      {loadState === "loading" ? (
        <div className="space-y-4" role="status" aria-label="Loading dashboard">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
            <SkeletonBlock className="h-[330px]" />
            <SkeletonBlock className="h-[330px]" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => <SkeletonBlock key={item} className="h-24" />)}
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
            <SkeletonBlock className="h-72" />
            <SkeletonBlock className="h-72" />
          </div>
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="rounded-xl border border-red-300/20 bg-red-400/[0.05] p-7 text-center" data-notion-surface>
          <p className="mb-4 text-sm text-slate-300">{syncMessage ?? "Failed to load your dashboard."}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="rounded-md bg-sky-200 px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => loadDashboardData()}>Retry</button>
            <Link href="/settings" className="rounded-md border border-white/10 bg-white/[0.035] px-4 py-2 text-sm font-medium text-slate-200">Settings</Link>
          </div>
        </div>
      ) : null}

      {loadState === "ready" ? (
        <div className="space-y-4">
          <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
            <section
              className="relative overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.02]"
              data-dashboard-primary-action
              data-notion-surface
            >
              <span className={`absolute inset-y-4 left-0 w-0.5 rounded-r ${primaryTone.accent}`} aria-hidden="true" />
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.065] px-5 py-3.5">
                <span className="flex items-center gap-2 text-xs font-medium text-slate-300">
                  <Sparkles className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
                  Smartlearn recommendation
                </span>
                <span className="text-[10px] text-slate-600">Priority 01</span>
              </div>

              <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_12rem]">
                <div className="min-w-0">
                  <div className={`inline-flex items-center gap-2 text-[11px] font-semibold ${primaryTone.label}`}>
                    <span className={`grid h-6 w-6 place-items-center rounded-md ${primaryTone.icon}`}>
                      <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    {primaryAction.badge}
                  </div>
                  <h2 className="mt-4 max-w-2xl text-[clamp(1.6rem,3.5vw,2.25rem)] font-semibold leading-[1.15] tracking-[-0.045em] text-white">
                    {primaryAction.title}
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                    {primaryAction.description}
                  </p>

                  <dl className="mt-5 grid max-w-2xl gap-2 sm:grid-cols-2">
                    {primaryAction.meta.map((item, index) => (
                      <div key={item} className="flex items-center gap-2 rounded-md bg-white/[0.028] px-3 py-2 text-[11px] text-slate-400">
                        <dt className="text-slate-600">{index === 0 ? "Detail" : "Context"}</dt>
                        <dd className="min-w-0 truncate text-slate-200">{item}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Link
                      href={primaryAction.href}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-sky-200 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
                    >
                      {primaryAction.cta}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    {primaryAction.secondaryHref ? (
                      <Link
                        href={primaryAction.secondaryHref}
                        className="inline-flex min-h-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.035] px-4 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.06] hover:text-white"
                      >
                        {primaryAction.secondaryLabel}
                      </Link>
                    ) : null}
                  </div>
                </div>

                <aside className="border-t border-white/[0.065] pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0" aria-label="Current semester status">
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-600">At a glance</p>
                  <dl className="mt-3 divide-y divide-white/[0.065]">
                    {[
                      ["Due this week", upcomingAssignments.length],
                      ["Urgent", urgentAssignments.length],
                      ["Focus hours", hoursThisWeek],
                      ["Active courses", courses.length],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                        <dt className="text-[11px] text-slate-500">{label}</dt>
                        <dd className="text-sm font-semibold tabular-nums text-slate-200">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Active course colors">
                    {courses.slice(0, 6).map((course) => (
                      <span
                        key={course.id}
                        className="h-2 w-6 rounded-full opacity-80"
                        style={{ backgroundColor: course.color ?? "#7dd3fc" }}
                        title={course.name}
                      />
                    ))}
                  </div>
                </aside>
              </div>
            </section>

            <Panel
              title="Upcoming"
              subtitle="Next four deadlines, ordered by due time"
              action={(
                <Link href="/assignments" className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-300 hover:text-sky-200">
                  View all <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              )}
              className="h-full"
            >
              {upcomingAssignments.length === 0 ? (
                <div className="grid min-h-[210px] place-items-center text-center">
                  <div>
                    <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-300/70" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-slate-200">No deadlines this week</p>
                    <p className="mt-1 text-xs text-slate-500">Your active courses are clear for seven days.</p>
                  </div>
                </div>
              ) : (
                <ol className="divide-y divide-white/[0.065]" data-dashboard-deadline-database>
                  {upcomingAssignments.slice(0, 4).map((assignment) => {
                    const urgent = assignment.due.getTime() - nowMs < 48 * HOUR_MS;
                    return (
                      <li key={assignment.id}>
                        <Link
                          href={assignmentHref(assignment.id)}
                          className="group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <span className={`grid h-9 w-9 place-items-center rounded-md text-center ${urgent ? "bg-orange-300/[0.09]" : "bg-white/[0.035]"}`}>
                            <span>
                              <span className={`block text-[7px] font-semibold uppercase tracking-[0.1em] ${urgent ? "text-orange-300" : "text-slate-600"}`}>{format(assignment.due, "MMM")}</span>
                              <span className="block text-xs font-semibold leading-none text-slate-200">{format(assignment.due, "d")}</span>
                            </span>
                          </span>
                          <span className="min-w-0">
                            <span className="line-clamp-1 text-[13px] font-medium text-slate-200 transition-colors group-hover:text-white">{assignment.title}</span>
                            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-slate-600">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: assignment.course?.color ?? "#7dd3fc" }} />
                              <span className="truncate">{assignment.course?.name ?? "Course"}</span>
                            </span>
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 text-slate-700 transition-transform group-hover:translate-x-0.5 group-hover:text-sky-300" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>
          </div>

          <section aria-label="Weekly snapshot" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" data-dashboard-metrics-grid>
            {weeklyMetrics.map((metric) => (
              <div key={metric.label} className="group relative overflow-hidden rounded-lg border border-white/[0.075] bg-white/[0.015] p-3.5 transition-colors hover:bg-white/[0.03]" data-notion-surface>
                <span className={`pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent ${metric.line} to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100`} />
                <div className="flex items-center gap-3">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${metric.tone}`}>{metric.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium text-slate-500">{metric.label}</p>
                    <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                      <strong className="text-base font-semibold tabular-nums text-white">{metric.value}</strong>
                      <span className="text-[10px] text-slate-600">{metric.note}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
            <Panel
              title="Study priorities"
              subtitle="Ranked from real deadlines and demonstrated mastery"
              action={<Link href="/practice" className="text-[11px] font-medium text-sky-300 hover:text-sky-200">Open practice</Link>}
            >
              {recommendations.length === 0 ? (
                <div className="flex min-h-44 flex-col items-center justify-center text-center">
                  <Target className="h-7 w-7 text-slate-600" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-slate-300">No study priorities yet</p>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">Complete a practice session so Smartlearn can rank your strongest next move.</p>
                  <button type="button" className="mt-4 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-medium text-slate-200" onClick={handleSync} disabled={syncing || !canvasConnection}>
                    {canvasConnection ? "Refresh course data" : "Connect Canvas first"}
                  </button>
                </div>
              ) : (
                <ol className="divide-y divide-white/[0.065]">
                  {recommendations.slice(0, 3).map((recommendation, index) => {
                    const accuracyLabel = recommendation.accuracy_pct === null
                      ? "Baseline needed"
                      : `${recommendation.accuracy_pct}% mastery`;
                    const accuracyTone = recommendation.accuracy_pct === null
                      ? "bg-white/[0.035] text-slate-500"
                      : recommendation.accuracy_pct < 60
                        ? "bg-amber-300/[0.08] text-amber-200"
                        : "bg-emerald-300/[0.08] text-emerald-200";

                    return (
                      <li key={`${recommendation.topic}-${index}`}>
                        <Link
                          href={`/practice${recommendation.course_id ? `?courseId=${recommendation.course_id}` : ""}`}
                          className="group grid gap-3 py-3.5 first:pt-0 last:pb-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
                        >
                          <span className={`grid h-8 w-8 place-items-center rounded-md text-[10px] font-semibold ${index === 0 ? "bg-sky-300/[0.10] text-sky-200" : "bg-white/[0.035] text-slate-500"}`}>
                            {index + 1}
                          </span>
                          <span className="min-w-0">
                            {recommendation.course_name ? (
                              <span className="line-clamp-1 text-[9px] font-medium text-slate-600">{recommendation.course_name}</span>
                            ) : null}
                            <strong className="mt-0.5 line-clamp-1 text-sm font-medium text-slate-100">{recommendation.topic}</strong>
                            <span className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{recommendation.reason}</span>
                          </span>
                          <span className="flex items-center gap-2 pl-11 sm:flex-col sm:items-end sm:pl-0">
                            <span className={`whitespace-nowrap rounded px-2 py-1 text-[10px] font-medium ${accuracyTone}`}>{accuracyLabel}</span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-300">
                              Practice <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>

            <Panel title="Quick links" subtitle="Open a learning tool">
              <div className="grid gap-0.5 sm:grid-cols-2 xl:grid-cols-1">
                <QuickTool href="/practice" icon={<Target className="h-3.5 w-3.5" />} label="Practice" />
                <QuickTool href="/notes" icon={<BookOpen className="h-3.5 w-3.5" />} label="Study guide" />
                <QuickTool href="/flashcards" icon={<Sparkles className="h-3.5 w-3.5" />} label="Flashcards" />
                <QuickTool href="/chat" icon={<MessageCircleQuestion className="h-3.5 w-3.5" />} label="Ask Smartlearn" />
              </div>

              <div className="mt-4 border-t border-white/[0.065] pt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-medium text-slate-600">Workspace status</p>
                  <span className={`h-1.5 w-1.5 rounded-full ${canvasConnection ? "bg-emerald-300" : "bg-orange-300"}`} />
                </div>
                <dl className="mt-3 space-y-2.5 text-[11px]">
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
            title="Courses"
            subtitle="Active Canvas courses and their next deadlines"
            action={<Link href="/courses" className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-300 hover:text-sky-200">View all <ArrowUpRight className="h-3 w-3.5" /></Link>}
          >
            {courses.length === 0 ? (
              <div className="flex flex-col items-center py-7 text-center">
                <GraduationCap className="h-7 w-7 text-slate-600" aria-hidden="true" />
                <p className="mt-2 text-sm text-slate-400">No active courses are synced.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-white/[0.065]" data-dashboard-course-database>
                <div className="hidden grid-cols-[minmax(0,1.6fr)_7rem_9rem_1.25rem] gap-4 border-b border-white/[0.065] bg-white/[0.018] px-3 py-2 text-[9px] font-medium text-slate-600 sm:grid">
                  <span>Course</span>
                  <span>Due this week</span>
                  <span>Next deadline</span>
                  <span />
                </div>
                <div className="divide-y divide-white/[0.065]">
                  {courses.slice(0, 6).map((course) => {
                    const courseDeadlines = upcomingAssignments.filter((assignment) => assignment.course?.id === course.id);
                    const nextDeadline = courseDeadlines[0];
                    return (
                      <Link
                        key={course.id}
                        href={`/courses/${course.id}`}
                        className="group grid gap-2 px-3 py-3 transition-colors hover:bg-white/[0.03] sm:grid-cols-[minmax(0,1.6fr)_7rem_9rem_1.25rem] sm:items-center sm:gap-4"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: course.color ?? "#7dd3fc" }} />
                          <span className="truncate text-[13px] font-medium text-slate-200 group-hover:text-white">{course.name}</span>
                        </span>
                        <span className="pl-[1.125rem] text-[11px] text-slate-500 sm:pl-0">{courseDeadlines.length} item{courseDeadlines.length === 1 ? "" : "s"}</span>
                        <span className="pl-[1.125rem] text-[11px] text-slate-500 sm:pl-0">{nextDeadline ? deadlineLabel(nextDeadline.due, nowMs) : "Schedule clear"}</span>
                        <ChevronRight className="hidden h-3.5 w-3.5 text-slate-700 transition-transform group-hover:translate-x-0.5 group-hover:text-sky-300 sm:block" aria-hidden="true" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </Panel>

          {unreadNotifications.length > 0 ? (
            <Panel title="Updates" subtitle="Unread information that may affect your plan">
              <ul className="divide-y divide-white/[0.065]">
                {unreadNotifications.slice(0, 3).map((notification) => (
                  <li key={notification.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-300" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-slate-200">{notification.title}</p>
                      {notification.body ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{notification.body}</p> : null}
                    </div>
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
