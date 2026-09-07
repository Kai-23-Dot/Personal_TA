"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { courseTone } from "@/frontend/lib/course-tone";
import { iconForHref } from "@/frontend/lib/nav-items";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileStack,
  Flame,
  GraduationCap,
  Link2,
  RefreshCw,
  Sparkles,
  Target,
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
      className={`card ${className}`}
      data-notion-surface
    >
      <div className="card-head">
        <div className="min-w-0">
          <h2 className="card-title">{title}</h2>
          {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
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
      className="group flex min-h-11 items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium text-[var(--ink-muted)] transition-colors hover:bg-[var(--wash-hover)] hover:text-[var(--ink)]"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors group-hover: text-[var(--ink-faint)]">
        {icon}
      </span>
      <span>{label}</span>
      <ChevronRight className="ml-auto h-3.5 w-3.5 text-[var(--ink)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--blue)]" />
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

/* Labels are page-specific ("Study guide" rather than "Notes"), but the icon for
   each destination comes from the shared registry so it matches the rail. */
const QUICK_TOOLS = [
  { href: "/practice",   label: "Practice" },
  { href: "/notes",      label: "Study guide" },
  { href: "/flashcards", label: "Flashcards" },
  { href: "/chat",       label: "Ask Smartlearn" },
] as const;

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
    urgent: { accent: "bg-[var(--warning-ink)]", chip: "status status-due" },
    focus:  { accent: "bg-[var(--blue)]",        chip: "status status-neutral" },
    clear:  { accent: "bg-[var(--success-ink)]", chip: "status status-done" },
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
      // Urgency is the one thing on this row worth colouring.
      tone: urgentAssignments.length > 0 ? "badge-icon--warning" : "badge-icon--accent",
    },
    {
      icon: <Flame className="h-4 w-4" />,
      label: "Study streak",
      value: `${studyStreak} ${studyStreak === 1 ? "day" : "days"}`,
      note: studyStreak > 0 ? "Momentum active" : "Start with one session",
      tone: "badge-icon--accent",
    },
    {
      icon: <Clock3 className="h-4 w-4" />,
      label: "Focus this week",
      value: `${hoursThisWeek} hrs`,
      note: "Completed sessions only",
      tone: "badge-icon--accent",
    },
    {
      icon: <FileStack className="h-4 w-4" />,
      label: "Active courses",
      value: String(courses.length),
      note: `${notesCount} note${notesCount === 1 ? "" : "s"} indexed`,
      tone: "badge-icon--accent",
      // The colour each course carries everywhere else, shown once as a key.
      extra: courses.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Active course colours">
          {courses.slice(0, 6).map((course) => (
            <span
              key={course.id}
              data-course-tone={courseTone(course.name)}
              className="course-swatch"
              title={course.name}
            />
          ))}
        </div>
      ) : null,
    },
  ];

  return (
    <div
      className="mx-auto max-w-[1260px] pb-20"
      data-dashboard-command-center
      data-dashboard-notion-workspace
    >
      <header className="mb-6 border-b border-[var(--rule)] pb-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center text-[var(--ink-faint)]">
              <GraduationCap className="h-7 w-7" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-[var(--ink-muted)]">{format(new Date(), "EEEE, MMMM d")}</p>
              <h1 className="mt-1 text-[clamp(1.75rem,4vw,2.35rem)] font-semibold leading-tight tracking-[-0.045em] text-[var(--ink)]">
                {greeting}{firstName ? `, ${firstName}` : ""}.
              </h1>
              <p className="mt-1.5 text-sm text-[var(--ink-muted)]">
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
              <p className="flex items-center justify-end gap-1.5 text-[10px] font-medium text-[var(--ink-muted)]">
                <span className={`h-1.5 w-1.5 rounded-full ${canvasConnection ? "bg-[var(--success-bg)]" : "bg-[var(--warning-bg)]"}`} />
                Canvas {canvasConnection ? "connected" : "not connected"}
              </p>
              <p className="mt-0.5 max-w-44 truncate text-[11px] text-[var(--ink-muted)]">
                {canvasConnection ? `Updated ${canvasUpdatedLabel}` : "Connect Canvas to import classes"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing || !canvasConnection}
              className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-[var(--rule)] bg-[var(--paper)] px-3 text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--blue-edge)] hover:bg-[var(--blue-wash)] hover:text-[var(--blue)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} aria-hidden="true" />
              {syncing ? "Syncing" : "Sync"}
            </button>
          </div>
        </div>
      </header>

      {syncMessage ? (
        <div className="card mb-5 flex items-start gap-2.5 px-4 py-3 text-xs text-[var(--ink-muted)]" role="status" data-notion-surface>
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--blue)]" aria-hidden="true" />
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
        <div className="rounded-xl border border-[var(--danger-ink)] bg-[var(--danger-bg)]/[0.05] p-7 text-center" data-notion-surface>
          <p className="mb-4 text-sm text-[var(--ink-muted)]">{syncMessage ?? "Failed to load your dashboard."}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="rounded-md bg-[var(--blue)] px-4 py-2 text-sm font-semibold text-slate-950" onClick={() => loadDashboardData()}>Retry</button>
            <Link href="/settings" className="rounded-md border border-[var(--rule)] bg-[var(--paper)] px-4 py-2 text-sm font-medium text-[var(--ink)]">Settings</Link>
          </div>
        </div>
      ) : null}

      {loadState === "ready" ? (
        <div className="space-y-4">
          <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
            <section
              className="card relative overflow-hidden"
              data-dashboard-primary-action
              data-notion-surface
            >
              <span className={`absolute inset-y-4 left-0 w-0.5 rounded-r ${primaryTone.accent}`} aria-hidden="true" />
              <div className="flex items-center justify-between gap-3 border-b border-[var(--rule)] px-5 py-3.5">
                <span className="flex items-center gap-2 text-xs font-medium text-[var(--ink-muted)]">
                  <Sparkles className="h-4 w-4 text-[var(--ink-faint)]" aria-hidden="true" />
                  Smartlearn recommendation
                </span>
                
              </div>

              <div className="grid gap-6 p-6 sm:p-7">
                <div className="min-w-0">
                  <span className={primaryTone.chip}>{primaryAction.badge}</span>
                  <h2 className="mt-4 max-w-2xl text-[clamp(1.6rem,3.5vw,2.25rem)] font-semibold leading-[1.15] tracking-[-0.045em] text-[var(--ink)]">
                    {primaryAction.title}
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">
                    {primaryAction.description}
                  </p>

                  <dl className="mt-5 grid max-w-2xl gap-2 sm:grid-cols-2">
                    {primaryAction.meta.map((item, index) => (
                      <div key={item} className="flex items-center gap-2 rounded-md bg-[var(--paper)] px-3 py-2 text-[11px] text-[var(--ink-muted)]">
                        <dt className="text-[var(--ink-muted)]">{index === 0 ? "Detail" : "Context"}</dt>
                        <dd className="min-w-0 truncate text-[var(--ink)]">{item}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Link
                      href={primaryAction.href}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[var(--blue)] px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-[var(--blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-edge)]"
                    >
                      {primaryAction.cta}
                    </Link>
                    {primaryAction.secondaryHref ? (
                      <Link
                        href={primaryAction.secondaryHref}
                        className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--rule)] bg-[var(--paper)] px-4 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--wash-hover)] hover:text-[var(--ink)]"
                      >
                        {primaryAction.secondaryLabel}
                      </Link>
                    ) : null}
                  </div>
                </div>

              </div>
            </section>

            <Panel
              title="Upcoming"
              subtitle="Next four deadlines, ordered by due time"
              action={(
                <Link href="/assignments" className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue)]">
                  View all <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              )}
              className="h-full"
            >
              {upcomingAssignments.length === 0 ? (
                <div className="grid min-h-[210px] place-items-center text-center">
                  <div>
                    <CheckCircle2 className="mx-auto h-7 w-7 text-[#1c3829]/70" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-[var(--ink)]">No deadlines this week</p>
                    <p className="mt-1 text-xs text-[var(--ink-muted)]">Your active courses are clear for seven days.</p>
                  </div>
                </div>
              ) : (
                <ol className="divide-y divide-[var(--rule)]" data-dashboard-deadline-database>
                  {upcomingAssignments.slice(0, 4).map((assignment) => {
                    const urgent = assignment.due.getTime() - nowMs < 48 * HOUR_MS;
                    return (
                      <li key={assignment.id}>
                        <Link
                          href={assignmentHref(assignment.id)}
                          className="group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <span className={`badge-icon flex-col ${urgent ? "badge-icon--warning" : ""}`}>
                            <span>
                              <span className={`block text-[10px] font-medium ${urgent ? "text-[#6e3630]" : "text-[var(--ink-muted)]"}`}>{format(assignment.due, "MMM")}</span>
                              <span className="block text-xs font-semibold leading-none text-[var(--ink)]">{format(assignment.due, "d")}</span>
                            </span>
                          </span>
                          <span className="min-w-0">
                            <span className="line-clamp-1 text-[13px] font-medium text-[var(--ink)] transition-colors group-hover:text-[var(--ink)]">{assignment.title}</span>
                            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-[var(--ink-muted)]">
                              <span className="course-dot" data-course-tone={courseTone(assignment.course?.name)} />
                              <span className="truncate">{assignment.course?.name ?? "Course"}</span>
                            </span>
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 text-[var(--ink)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--blue)]" aria-hidden="true" />
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
              <div key={metric.label} className="kpi" data-notion-surface>
                <span className={`badge-icon ${metric.tone}`}>{metric.icon}</span>
                <div className="min-w-0">
                  <p className="kpi-value">{metric.value}</p>
                  <p className="kpi-label">{metric.label}</p>
                  <p className="kpi-note">{metric.note}</p>
                  {"extra" in metric ? metric.extra : null}
                </div>
              </div>
            ))}
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
            <Panel
              title="Study priorities"
              subtitle="Ranked from real deadlines and demonstrated mastery"
              action={<Link href="/practice" className="text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue)]">Open practice</Link>}
            >
              {recommendations.length === 0 ? (
                <div className="flex min-h-44 flex-col items-center justify-center text-center">
                  <Target className="h-7 w-7 text-[var(--ink-muted)]" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-[var(--ink-muted)]">No study priorities yet</p>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--ink-muted)]">Complete a practice session so Smartlearn can rank your strongest next move.</p>
                  <button type="button" className="mt-4 rounded-md border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-xs font-medium text-[var(--ink)]" onClick={handleSync} disabled={syncing || !canvasConnection}>
                    {canvasConnection ? "Refresh course data" : "Connect Canvas first"}
                  </button>
                </div>
              ) : (
                <ol className="divide-y divide-[var(--rule)]">
                  {recommendations.slice(0, 3).map((recommendation, index) => {
                    const pct = recommendation.accuracy_pct;
                    // How far along reads from the bar's length; the exact
                    // figure sits beside it for anyone who wants the number.
                    const meterTone =
                      pct === null ? "" : pct < 60 ? "meter-fill--low" : pct < 80 ? "meter-fill--mid" : "meter-fill--high";

                    return (
                      <li key={`${recommendation.topic}-${index}`}>
                        <Link
                          href={`/practice${recommendation.course_id ? `?courseId=${recommendation.course_id}` : ""}`}
                          className="group grid gap-4 py-5 first:pt-0 last:pb-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
                        >
                          <span className={`badge-icon text-[13px] font-semibold ${index === 0 ? "badge-icon--accent" : ""}`}>
                            {index + 1}
                          </span>
                          <span className="min-w-0">
                            {recommendation.course_name ? (
                              <span className="line-clamp-1 text-xs font-medium text-[var(--ink-muted)]">{recommendation.course_name}</span>
                            ) : null}
                            <strong className="mt-1 line-clamp-1 text-[15px] font-semibold text-[var(--ink)]">{recommendation.topic}</strong>
                            <span className="mt-1.5 line-clamp-2 text-[13px] leading-6 text-[var(--ink-muted)]">{recommendation.reason}</span>
                          </span>
                          <span className="flex items-center gap-2 pl-11 sm:flex-col sm:items-end sm:pl-0">
                            {pct === null ? (
                              <span className="status status-neutral">Baseline needed</span>
                            ) : (
                              <span
                                className="meter w-full sm:w-32"
                                role="img"
                                aria-label={`Mastery: ${pct} percent`}
                              >
                                <span className="meter-track">
                                  <span className={`meter-fill ${meterTone}`} style={{ width: `${pct}%` }} />
                                </span>
                                <span className="meter-value">{pct}%</span>
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--blue)]">
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
                {QUICK_TOOLS.map(({ href, label }) => {
                  const Icon = iconForHref(href);
                  return <QuickTool key={href} href={href} icon={<Icon className="h-4 w-4" />} label={label} />;
                })}
              </div>

              <div className="mt-4 border-t border-[var(--rule)] pt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-medium text-[var(--ink-muted)]">Workspace status</p>
                  <span className={`h-1.5 w-1.5 rounded-full ${canvasConnection ? "bg-[var(--success-bg)]" : "bg-[var(--warning-bg)]"}`} />
                </div>
                <dl className="mt-3 space-y-2.5 text-[11px]">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="flex items-center gap-2 text-[var(--ink-muted)]"><Link2 className="h-3.5 w-3.5" /> Canvas</dt>
                    <dd className={canvasConnection ? "text-[#1c3829]" : "text-[#533b1b]"}>{canvasConnection ? "Connected" : "Not connected"}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="flex items-center gap-2 text-[var(--ink-muted)]"><GraduationCap className="h-3.5 w-3.5" /> Active courses</dt>
                    <dd className="tabular-nums text-[var(--ink-muted)]">{courses.length}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="flex items-center gap-2 text-[var(--ink-muted)]"><FileStack className="h-3.5 w-3.5" /> Indexed material</dt>
                    <dd className="tabular-nums text-[var(--ink-muted)]">{notesCount} items</dd>
                  </div>
                </dl>
              </div>
            </Panel>
          </div>

          <Panel
            title="Courses"
            subtitle="Active Canvas courses and their next deadlines"
            action={<Link href="/courses" className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue)]">View all <ArrowUpRight className="h-3 w-3.5" /></Link>}
          >
            {courses.length === 0 ? (
              <div className="flex flex-col items-center py-7 text-center">
                <GraduationCap className="h-7 w-7 text-[var(--ink-muted)]" aria-hidden="true" />
                <p className="mt-2 text-sm text-[var(--ink-muted)]">No active courses are synced.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-[var(--rule)]" data-dashboard-course-database>
                <div className="hidden grid-cols-[minmax(0,1.6fr)_7rem_9rem_1.25rem] gap-4 border-b border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-[9px] font-medium text-[var(--ink-muted)] sm:grid">
                  <span>Course</span>
                  <span>Due this week</span>
                  <span>Next deadline</span>
                  <span />
                </div>
                <div className="divide-y divide-[var(--rule)]">
                  {courses.slice(0, 6).map((course) => {
                    const courseDeadlines = upcomingAssignments.filter((assignment) => assignment.course?.id === course.id);
                    const nextDeadline = courseDeadlines[0];
                    return (
                      <Link
                        key={course.id}
                        href={`/courses/${course.id}`}
                        className="group grid gap-2 px-3 py-3 transition-colors hover:bg-[var(--wash-hover)] sm:grid-cols-[minmax(0,1.6fr)_7rem_9rem_1.25rem] sm:items-center sm:gap-4"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="course-dot" data-course-tone={courseTone(course.name)} />
                          <span className="truncate text-[13px] font-medium text-[var(--ink)] group-hover:text-[var(--ink)]">{course.name}</span>
                        </span>
                        <span className="pl-[1.125rem] text-[11px] text-[var(--ink-muted)] sm:pl-0">{courseDeadlines.length} item{courseDeadlines.length === 1 ? "" : "s"}</span>
                        <span className="pl-[1.125rem] text-[11px] text-[var(--ink-muted)] sm:pl-0">{nextDeadline ? deadlineLabel(nextDeadline.due, nowMs) : "Schedule clear"}</span>
                        <ChevronRight className="hidden h-3.5 w-3.5 text-[var(--ink)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--blue)] sm:block" aria-hidden="true" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </Panel>

          {unreadNotifications.length > 0 ? (
            <Panel title="Updates" subtitle="Unread information that may affect your plan">
              <ul className="divide-y divide-[var(--rule)]">
                {unreadNotifications.slice(0, 3).map((notification) => (
                  <li key={notification.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--blue)]" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[var(--ink)]">{notification.title}</p>
                      {notification.body ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--ink-muted)]">{notification.body}</p> : null}
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
