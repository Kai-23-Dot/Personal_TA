"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { AlertCircle, BookOpen, ChevronRight, GraduationCap, RefreshCw } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import {
  WorkspacePage,
  WorkspacePageHeader,
  WorkspaceSectionHeader,
  WorkspaceSurface,
} from "@/frontend/components/workspace/workspace-primitives";
import {
  TodayAssignmentList,
  type AssignmentFilter,
} from "@/frontend/components/dashboard/today-assignment-list";
import { RecommendedNext, StudyOverview } from "@/frontend/components/dashboard/today-panels";
import type {
  DashboardAssignment,
  DashboardCourse,
  DashboardPrimaryAction,
} from "@/frontend/components/dashboard/dashboard-types";

type LmsConnection = {
  id: string;
  platform: string;
  last_synced_at: string | null;
  is_active: boolean;
};
type Profile = { full_name: string | null };
type FocusSession = { duration_minutes: number | null; started_at: string };
type PracticeActivity = { created_at: string };
type Recommendation = {
  topic: string;
  course_name: string | null;
  accuracy_pct: number | null;
  due_date: string | null;
  reason: string;
  course_id: string | null;
};
type Notification = { id: string; title: string; body: string | null; read_at: string | null };
type NoteRecord = {
  id: string;
  title: string | null;
  file_name: string | null;
  unit_name: string | null;
  updated_at: string;
  course_id: string | null;
};
type DashboardLoadState = "loading" | "ready" | "error";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const FILTER_STORAGE_KEY = "smartlearn:dashboard:assignment-filter";

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function deadlineLabel(due: Date, now: Date): string {
  const difference = due.getTime() - now.getTime();
  if (difference < 0) return `${formatDistanceToNowStrict(due)} overdue`;
  if (difference <= HOUR_MS) return "Due within 1 hour";
  if (difference < DAY_MS) return `Due in ${Math.max(1, Math.ceil(difference / HOUR_MS))}h`;
  if (difference < 2 * DAY_MS) return "Due tomorrow";
  return format(due, "EEE, MMM d");
}

function createPrimaryAction({
  canvasConnection,
  urgentAssignments,
  upcomingAssignments,
  recommendation,
  courses,
}: {
  canvasConnection: LmsConnection | undefined;
  urgentAssignments: DashboardAssignment[];
  upcomingAssignments: DashboardAssignment[];
  recommendation: Recommendation | null;
  courses: DashboardCourse[];
}): DashboardPrimaryAction {
  const now = new Date();
  if (!canvasConnection) {
    return {
      badge: "Start here",
      title: "Connect Canvas to see what matters next",
      description: "Import current courses, deadlines, and materials so Smartlearn can rank your next step.",
      href: "/settings/setup/canvas",
      cta: "Connect Canvas",
      tone: "focus",
      meta: ["About 2 minutes", "Secure token setup"],
    };
  }

  const urgent = urgentAssignments[0];
  const urgentDue = safeDate(urgent?.due_date);
  if (urgent && urgentDue) {
    return {
      badge: urgentDue.getTime() < now.getTime() ? "Overdue" : "Most urgent",
      title: urgent.title,
      description: `${urgent.course?.name ?? "Course"} is your closest deadline. Review the instructions and decide what support you need.`,
      href: `/assignments?assignmentId=${encodeURIComponent(urgent.id)}`,
      cta: "Open assignment",
      secondaryHref: `/practice${urgent.course?.id ? `?courseId=${encodeURIComponent(urgent.course.id)}` : ""}`,
      secondaryLabel: "Practice first",
      tone: "urgent",
      meta: [deadlineLabel(urgentDue, now), format(urgentDue, "MMM d · p")],
    };
  }

  if (recommendation) {
    return {
      badge: "Best study move",
      title: recommendation.topic,
      description: recommendation.reason,
      href: `/practice${recommendation.course_id ? `?courseId=${encodeURIComponent(recommendation.course_id)}` : ""}`,
      cta: "Start targeted practice",
      secondaryHref: "/review",
      secondaryLabel: "Open review queue",
      tone: "focus",
      meta: [recommendation.course_name ?? "Across your courses", recommendation.accuracy_pct === null ? "Baseline not tested" : `${recommendation.accuracy_pct}% current accuracy`],
    };
  }

  const next = upcomingAssignments[0];
  const nextDue = safeDate(next?.due_date);
  if (next && nextDue) {
    return {
      badge: "Next deadline",
      title: next.title,
      description: `Get ahead on ${next.course?.name ?? "your next course task"} before it becomes urgent.`,
      href: `/assignments?assignmentId=${encodeURIComponent(next.id)}`,
      cta: "Review assignment",
      secondaryHref: "/assignments",
      secondaryLabel: "All assignments",
      tone: "focus",
      meta: [deadlineLabel(nextDue, now), format(nextDue, "MMM d · p")],
    };
  }

  return {
    badge: "All clear",
    title: "No deadlines need attention this week",
    description: "Use the open time to strengthen a topic, organize notes, or start a focused study session.",
    href: "/practice",
    cta: "Choose a practice topic",
    secondaryHref: "/notes",
    secondaryLabel: "Organize notes",
    tone: "clear",
    meta: [`${courses.length} active course${courses.length === 1 ? "" : "s"}`, "Seven-day view is clear"],
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [assignments, setAssignments] = useState<DashboardAssignment[]>([]);
  const [connections, setConnections] = useState<LmsConnection[]>([]);
  const [courses, setCourses] = useState<DashboardCourse[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [practiceActivity, setPracticeActivity] = useState<PracticeActivity[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [loadState, setLoadState] = useState<DashboardLoadState>("loading");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [updatingAssignmentId, setUpdatingAssignmentId] = useState<string | null>(null);
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>("today");

  useEffect(() => {
    const saved = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (saved === "today" || saved === "week" || saved === "all" || saved === "completed") setAssignmentFilter(saved);
  }, []);

  async function loadDashboardData(showLoading = true) {
    if (showLoading) setLoadState("loading");
    try {
      const responses = await Promise.all([
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
      if (!responses[0].ok || !responses[1].ok || !responses[2].ok) throw new Error("Could not load your workspace.");
      const values = await Promise.all(responses.map(async (response) => response.ok ? response.json() : []));
      setAssignments(Array.isArray(values[0]) ? values[0] : []);
      setConnections(Array.isArray(values[1]) ? values[1] : []);
      setCourses(Array.isArray(values[2]) ? values[2] : []);
      setProfile(values[3] && !Array.isArray(values[3]) ? values[3] : null);
      setFocusSessions(Array.isArray(values[4]) ? values[4] : []);
      setPracticeActivity(Array.isArray(values[5]) ? values[5] : []);
      setNotifications(Array.isArray(values[6]) ? values[6] : []);
      setNotes(Array.isArray(values[7]) ? values[7] : []);
      setRecommendations(Array.isArray(values[8]) ? values[8] : []);
      setLoadState("ready");
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Failed to load your workspace.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    void loadDashboardData();
    const handleSyncComplete = () => void loadDashboardData(false);
    window.addEventListener("smartlearn:sync-complete", handleSyncComplete);
    return () => window.removeEventListener("smartlearn:sync-complete", handleSyncComplete);
  }, []);

  const [now] = useState(() => new Date());
  const canvasConnection = connections.find((connection) => connection.platform === "canvas" && connection.is_active);
  const openDatedAssignments = useMemo(() => assignments
    .filter((assignment) => !assignment.is_completed && safeDate(assignment.due_date))
    .sort((left, right) => (safeDate(left.due_date)?.getTime() ?? 0) - (safeDate(right.due_date)?.getTime() ?? 0)), [assignments]);
  const upcomingAssignments = openDatedAssignments.filter((assignment) => (safeDate(assignment.due_date)?.getTime() ?? 0) >= now.getTime());
  const dueThisWeek = openDatedAssignments.filter((assignment) => (safeDate(assignment.due_date)?.getTime() ?? 0) <= now.getTime() + 7 * DAY_MS);
  const urgentAssignments = dueThisWeek.filter((assignment) => (safeDate(assignment.due_date)?.getTime() ?? 0) - now.getTime() < 2 * DAY_MS);
  const selectedAssignment = assignments.find((assignment) => assignment.id === searchParams.get("assignmentId")) ?? null;

  const hoursThisWeek = useMemo(() => {
    const weekAgo = now.getTime() - 7 * DAY_MS;
    const minutes = focusSessions.filter((session) => new Date(session.started_at).getTime() >= weekAgo).reduce((total, session) => total + (session.duration_minutes ?? 0), 0);
    return Math.round((minutes / 60) * 10) / 10;
  }, [focusSessions, now]);

  const studyStreak = useMemo(() => {
    const days = new Set([
      ...focusSessions.map((session) => format(new Date(session.started_at), "yyyy-MM-dd")),
      ...practiceActivity.map((session) => format(new Date(session.created_at), "yyyy-MM-dd")),
    ]);
    let streak = 0;
    for (let index = 0; index < 60; index += 1) {
      if (!days.has(format(new Date(now.getTime() - index * DAY_MS), "yyyy-MM-dd"))) break;
      streak += 1;
    }
    return streak;
  }, [focusSessions, now, practiceActivity]);

  const primaryAction = createPrimaryAction({
    canvasConnection,
    urgentAssignments,
    upcomingAssignments,
    recommendation: recommendations[0] ?? null,
    courses,
  });
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || null;
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const unreadNotifications = notifications.filter((notification) => !notification.read_at).slice(0, 3);
  const canvasUpdated = canvasConnection?.last_synced_at ? formatDistanceToNowStrict(parseISO(canvasConnection.last_synced_at), { addSuffix: true }) : "not synced yet";

  function changeAssignmentFilter(filter: AssignmentFilter) {
    setAssignmentFilter(filter);
    try { window.localStorage.setItem(FILTER_STORAGE_KEY, filter); } catch {}
  }

  function openAssignment(assignment: DashboardAssignment) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("assignmentId", assignment.id);
    router.push(`/dashboard?${params.toString()}`, { scroll: false });
  }

  function closeAssignment() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("assignmentId");
    router.replace(params.size ? `/dashboard?${params.toString()}` : "/dashboard", { scroll: false });
  }

  async function toggleCompleted(assignment: DashboardAssignment) {
    const nextCompleted = !assignment.is_completed;
    setUpdatingAssignmentId(assignment.id);
    setAssignments((current) => current.map((item) => item.id === assignment.id ? { ...item, is_completed: nextCompleted } : item));
    try {
      const response = await fetch("/api/assignments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: assignment.id, is_completed: nextCompleted }),
      });
      if (!response.ok) throw new Error("The assignment status could not be updated.");
    } catch (error) {
      setAssignments((current) => current.map((item) => item.id === assignment.id ? { ...item, is_completed: assignment.is_completed } : item));
      setSyncMessage(error instanceof Error ? error.message : "The assignment status could not be updated.");
    } finally {
      setUpdatingAssignmentId(null);
    }
  }

  async function handleSync() {
    setSyncMessage(null);
    setSyncing(true);
    try {
      const response = await fetch("/api/sync/all?mode=quick", { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await response.json();
      if (!response.ok || data?.success === false) throw new Error(data?.error || data?.errors?.[0] || "Sync failed. Check your Canvas connection.");
      setSyncMessage("Canvas sync complete. Your workspace is current.");
      window.dispatchEvent(new Event("smartlearn:sync-complete"));
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        icon={GraduationCap}
        eyebrow={`Today · ${format(now, "EEEE, MMMM d")}`}
        title={`${greeting}${firstName ? `, ${firstName}` : ""}.`}
        description={urgentAssignments.length > 0
          ? `${urgentAssignments.length} deadline${urgentAssignments.length === 1 ? " needs" : "s need"} your attention within 48 hours.`
          : dueThisWeek.length > 0
            ? `${dueThisWeek.length} item${dueThisWeek.length === 1 ? " is" : "s are"} due in the next seven days.`
            : "Your next seven days are clear."}
        action={(
          <div className="flex items-center gap-2">
            <span className="hidden text-right sm:block">
              <span className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground"><span className={`h-2 w-2 rounded-full ${canvasConnection ? "bg-success" : "bg-warning"}`} aria-hidden="true" />Canvas {canvasConnection ? "connected" : "disconnected"}</span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground/70">{canvasConnection ? `Updated ${canvasUpdated}` : "Connect in Settings"}</span>
            </span>
            <Button variant="secondary" size="sm" onClick={() => void handleSync()} disabled={syncing || !canvasConnection} className="h-11 sm:h-9">
              <RefreshCw className={syncing ? "animate-spin" : ""} aria-hidden="true" />{syncing ? "Syncing" : "Sync"}
            </Button>
          </div>
        )}
      />

      {syncMessage ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-border bg-surface-1 px-4 py-3 text-sm text-muted-foreground" role="status">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{syncMessage}
        </div>
      ) : null}

      {loadState === "loading" ? (
        <div className="mt-5 space-y-4" role="status" aria-label="Loading Today workspace">
          <div className="skeleton-shimmer h-32 rounded-lg" />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]"><div className="skeleton-shimmer h-[30rem] rounded-lg" /><div className="skeleton-shimmer h-80 rounded-lg" /></div>
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="mt-5 rounded-lg border border-danger/25 bg-danger/10 px-5 py-8 text-center">
          <p className="text-sm text-foreground">{syncMessage ?? "Failed to load your workspace."}</p>
          <div className="mt-4 flex justify-center gap-2"><Button onClick={() => void loadDashboardData()}>Retry</Button><Button asChild variant="secondary"><Link href="/settings">Settings</Link></Button></div>
        </div>
      ) : null}

      {loadState === "ready" ? (
        <div className="mt-5 space-y-4">
          <RecommendedNext action={primaryAction} />
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <TodayAssignmentList
              assignments={assignments}
              filter={assignmentFilter}
              onFilterChange={changeAssignmentFilter}
              selectedAssignment={selectedAssignment}
              onSelectAssignment={openAssignment}
              onCloseAssignment={closeAssignment}
              onToggleCompleted={toggleCompleted}
              updatingId={updatingAssignmentId}
            />
            <StudyOverview
              dueCount={dueThisWeek.length}
              streak={studyStreak}
              focusHours={hoursThisWeek}
              materialCount={notes.length}
              courseCount={courses.length}
              hasPracticeHistory={practiceActivity.length > 0}
            />
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <WorkspaceSurface>
              <WorkspaceSectionHeader title="Recent materials" description="Recently updated notes and imported course content" action={<Link href="/notes" className="text-xs font-medium text-primary hover:underline">Open library</Link>} />
              {notes.length === 0 ? (
                <div className="px-5 py-8 text-center"><BookOpen className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-medium">No indexed materials yet</p><p className="mt-1 text-xs text-muted-foreground">Sync Canvas or upload a note to build your library.</p></div>
              ) : (
                <div>
                  {notes.slice(0, 4).map((note) => (
                    <Link key={note.id} href={`/notes?noteId=${encodeURIComponent(note.id)}`} className="group grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                      <span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground">{note.title || note.file_name || "Untitled material"}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{note.unit_name || "Course material"} · Updated {formatDistanceToNowStrict(parseISO(note.updated_at), { addSuffix: true })}</span></span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              )}
            </WorkspaceSurface>

            <WorkspaceSurface>
              <WorkspaceSectionHeader title="Updates" description="Unread changes that may affect your plan" />
              {unreadNotifications.length === 0 ? (
                <div className="px-5 py-8 text-center"><p className="text-sm font-medium">You’re up to date</p><p className="mt-1 text-xs text-muted-foreground">No unread workspace updates.</p></div>
              ) : (
                <ul>
                  {unreadNotifications.map((notification) => (
                    <li key={notification.id} className="border-b border-border px-4 py-3 last:border-b-0"><p className="text-sm font-medium text-foreground">{notification.title}</p>{notification.body ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{notification.body}</p> : null}</li>
                  ))}
                </ul>
              )}
            </WorkspaceSurface>
          </div>
        </div>
      ) : null}
    </WorkspacePage>
  );
}
