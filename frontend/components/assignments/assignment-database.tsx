"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ArrowLeft, ArrowRight, ArrowUpRight, Bot, CalendarDays, Check, ChevronRight, Columns3, List, Search, Sparkles } from "lucide-react";
import { cn } from "@/backend/utils";
import { AssignmentDocument } from "@/frontend/components/assignments/AssignmentDocument";
import type { DashboardAssignment, DashboardCourse } from "@/frontend/components/dashboard/dashboard-types";
import { Button } from "@/frontend/components/ui/button";
import { SidePeek } from "@/frontend/components/workspace/side-peek";
import { DataRow, StatusTag, WorkspaceSurface, WorkspaceToolbar } from "@/frontend/components/workspace/workspace-primitives";

type AssignmentView = "list" | "board" | "calendar";
type StatusFilter = "all" | "pending" | "completed";
type DueFilter = "any" | "overdue" | "today" | "week" | "no-date";
type UrgencyFilter = "all" | "urgent";
type SortOrder = "due-asc" | "due-desc" | "title";
const VIEW_KEY = "smartlearn:assignments:view";
const DAY_MS = 86_400_000;

function dueDate(assignment: DashboardAssignment) {
  if (!assignment.due_date) return null;
  const parsed = parseISO(assignment.due_date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function assignmentStatus(assignment: DashboardAssignment, now: Date) {
  if (assignment.is_completed) return { label: "Completed", tone: "success" as const };
  const due = dueDate(assignment);
  if (!due) return { label: "No due date", tone: "neutral" as const };
  if (due < now) return { label: "Overdue", tone: "danger" as const };
  if (isSameDay(due, now)) return { label: "Due today", tone: "warning" as const };
  if (due.getTime() - now.getTime() < 2 * DAY_MS) return { label: "Due soon", tone: "warning" as const };
  return { label: "Upcoming", tone: "neutral" as const };
}

function filterDue(assignment: DashboardAssignment, filter: DueFilter, now: Date) {
  if (filter === "any") return true;
  const due = dueDate(assignment);
  if (filter === "no-date") return !due;
  if (!due) return false;
  if (filter === "overdue") return !assignment.is_completed && due < now;
  if (filter === "today") return isSameDay(due, now);
  return due >= now && due.getTime() <= now.getTime() + 7 * DAY_MS;
}

export function AssignmentDatabase({
  assignments,
  courses,
  initialCourseId,
  selectedAssignment,
  onSelectAssignment,
  onCloseAssignment,
  onToggleCompleted,
  updatingId,
  summary,
  summaryLoadingId,
  actionError,
  onSummary,
  onQuiz,
  onCoach,
}: {
  assignments: DashboardAssignment[];
  courses: DashboardCourse[];
  initialCourseId: string | null;
  selectedAssignment: DashboardAssignment | null;
  onSelectAssignment: (assignment: DashboardAssignment) => void;
  onCloseAssignment: () => void;
  onToggleCompleted: (assignment: DashboardAssignment) => Promise<void>;
  updatingId: string | null;
  summary: { id: string; text: string } | null;
  summaryLoadingId: string | null;
  actionError: string | null;
  onSummary: (assignment: DashboardAssignment) => Promise<void>;
  onQuiz: (assignment: DashboardAssignment) => Promise<void>;
  onCoach: (assignment: DashboardAssignment) => void;
}) {
  const [query, setQuery] = useState("");
  const [courseId, setCourseId] = useState(initialCourseId ?? "all");
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [due, setDue] = useState<DueFilter>("any");
  const [urgency, setUrgency] = useState<UrgencyFilter>("all");
  const [sort, setSort] = useState<SortOrder>("due-asc");
  const [view, setView] = useState<AssignmentView>("list");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [now] = useState(() => new Date());

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === "board" || saved === "calendar") setView(saved);
    } catch {}
  }, []);
  useEffect(() => { setCourseId(initialCourseId ?? "all"); }, [initialCourseId]);

  const visible = useMemo(() => assignments.filter((assignment) => {
    if (courseId !== "all" && assignment.course?.id !== courseId) return false;
    if (status === "pending" && assignment.is_completed) return false;
    if (status === "completed" && !assignment.is_completed) return false;
    if (!filterDue(assignment, due, now)) return false;
    if (urgency === "urgent" && !["Overdue", "Due today", "Due soon"].includes(assignmentStatus(assignment, now).label)) return false;
    const normalized = query.trim().toLowerCase();
    return !normalized || [assignment.title, assignment.course?.name, assignment.assignment_type].some((value) => value?.toLowerCase().includes(normalized));
  }).sort((left, right) => {
    if (sort === "title") return left.title.localeCompare(right.title);
    const leftDate = dueDate(left)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightDate = dueDate(right)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return sort === "due-asc" ? leftDate - rightDate : rightDate - leftDate;
  }), [assignments, courseId, due, now, query, sort, status, urgency]);

  function setDatabaseView(next: AssignmentView) {
    setView(next);
    try { window.localStorage.setItem(VIEW_KEY, next); } catch {}
  }

  return (
    <>
      <WorkspaceSurface>
        <div className="border-b border-border p-3 sm:p-4">
          <WorkspaceToolbar>
            <label className="relative min-w-[12rem] flex-1 sm:max-w-sm"><span className="sr-only">Search assignments</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assignments…" className="h-11 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring sm:h-10" /></label>
            <select value={courseId} onChange={(event) => setCourseId(event.target.value)} aria-label="Filter by course" className="h-11 min-w-40 rounded-md border border-input bg-card px-3 text-sm sm:h-10"><option value="all">All courses</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select>
            <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} aria-label="Filter by status" className="h-11 rounded-md border border-input bg-card px-3 text-sm sm:h-10"><option value="all">All statuses</option><option value="pending">Pending</option><option value="completed">Completed</option></select>
            <select value={due} onChange={(event) => setDue(event.target.value as DueFilter)} aria-label="Filter by due date" className="h-11 rounded-md border border-input bg-card px-3 text-sm sm:h-10"><option value="any">Any due date</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="week">Next 7 days</option><option value="no-date">No due date</option></select>
            <select value={urgency} onChange={(event) => setUrgency(event.target.value as UrgencyFilter)} aria-label="Filter by urgency" className="h-11 rounded-md border border-input bg-card px-3 text-sm sm:h-10"><option value="all">Any urgency</option><option value="urgent">Needs attention</option></select>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortOrder)} aria-label="Sort assignments" className="h-11 rounded-md border border-input bg-card px-3 text-sm sm:h-10"><option value="due-asc">Due: earliest</option><option value="due-desc">Due: latest</option><option value="title">Title A–Z</option></select>
            <div className="ml-auto flex h-11 items-center rounded-md border border-border p-1 sm:h-10" role="group" aria-label="Assignment view">
              {([{ value: "list", label: "List", icon: List }, { value: "board", label: "Board", icon: Columns3 }, { value: "calendar", label: "Calendar", icon: CalendarDays }] as const).map(({ value, label, icon: Icon }) => <button key={value} type="button" onClick={() => setDatabaseView(value)} aria-label={`${label} view`} aria-pressed={view === value} className={cn("grid h-8 w-8 place-items-center rounded text-muted-foreground hover:text-foreground", view === value && "bg-accent text-accent-foreground")}><Icon className="h-4 w-4" /></button>)}
            </div>
          </WorkspaceToolbar>
        </div>

        {visible.length === 0 ? <div className="px-5 py-14 text-center"><CalendarDays className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No matching assignments</p><p className="mt-1 text-xs text-muted-foreground">Adjust the filters or sync Canvas for updated coursework.</p></div> : view === "list" ? (
          <AssignmentList assignments={visible} now={now} selectedId={selectedAssignment?.id ?? null} updatingId={updatingId} onSelect={onSelectAssignment} onToggleCompleted={onToggleCompleted} />
        ) : view === "board" ? (
          <AssignmentBoard assignments={visible} now={now} onSelect={onSelectAssignment} />
        ) : (
          <AssignmentCalendar assignments={visible} month={month} onMonthChange={setMonth} onSelect={onSelectAssignment} />
        )}
      </WorkspaceSurface>

      <SidePeek
        open={Boolean(selectedAssignment)}
        onOpenChange={(open) => { if (!open) onCloseAssignment(); }}
        title={selectedAssignment?.title ?? "Assignment"}
        description={selectedAssignment?.course?.name ?? "Assignment details"}
        footer={selectedAssignment ? <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => void onToggleCompleted(selectedAssignment)} disabled={updatingId === selectedAssignment.id}>{selectedAssignment.is_completed ? "Mark incomplete" : "Mark complete"}</Button>{selectedAssignment.url ? <Button asChild variant="outline"><a href={selectedAssignment.url} target="_blank" rel="noreferrer">Open in Canvas <ArrowUpRight /></a></Button> : null}</div> : undefined}
      >
        {selectedAssignment ? <div className="space-y-6">
          <dl className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2"><Detail label="Due" value={dueDate(selectedAssignment) ? format(dueDate(selectedAssignment) as Date, "PPp") : "No due date"} /><Detail label="Status" value={assignmentStatus(selectedAssignment, now).label} /><Detail label="Type" value={selectedAssignment.assignment_type ?? "Assignment"} capitalize /><Detail label="Estimated effort" value={selectedAssignment.estimated_minutes ? `${selectedAssignment.estimated_minutes} minutes` : "Not provided"} /></dl>
          <section><h3 className="text-sm font-semibold">Instructions</h3><div className="mt-3 rounded-lg border border-border bg-background/35 p-4">{selectedAssignment.description ? <AssignmentDocument html={selectedAssignment.description} /> : <p className="text-sm text-muted-foreground">No instructions were provided.</p>}</div></section>
          {summary?.id === selectedAssignment.id ? <section className="rounded-lg border border-primary/20 bg-primary/5 p-4"><h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">AI summary</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{summary.text}</p></section> : null}
          {actionError ? <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{actionError}</p> : null}
          <section><h3 className="text-sm font-semibold">Smartlearn actions</h3><div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void onSummary(selectedAssignment)} disabled={summaryLoadingId === selectedAssignment.id}><Sparkles />{summaryLoadingId === selectedAssignment.id ? "Summarizing…" : "Summarize"}</Button><Button onClick={() => void onQuiz(selectedAssignment)}>Generate quiz</Button><Button variant="outline" onClick={() => onCoach(selectedAssignment)}><Bot />Ask assignment coach</Button></div></section>
        </div> : null}
      </SidePeek>
    </>
  );
}

function Detail({ label, value, capitalize = false }: { label: string; value: string; capitalize?: boolean }) { return <div className="bg-card p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className={cn("mt-1 text-sm font-medium text-foreground", capitalize && "capitalize")}>{value}</dd></div>; }

function AssignmentList({ assignments, now, selectedId, updatingId, onSelect, onToggleCompleted }: { assignments: DashboardAssignment[]; now: Date; selectedId: string | null; updatingId: string | null; onSelect: (assignment: DashboardAssignment) => void; onToggleCompleted: (assignment: DashboardAssignment) => Promise<void> }) {
  return <div><div className="hidden grid-cols-[2.25rem_minmax(15rem,1fr)_10rem_8rem_7rem_1.5rem] gap-3 border-b border-border bg-surface-1/45 px-4 py-2 text-[11px] text-muted-foreground lg:grid"><span /><span>Assignment</span><span>Course</span><span>Due</span><span>Status</span><span /></div>{assignments.map((assignment) => { const due = dueDate(assignment); const state = assignmentStatus(assignment, now); return <DataRow key={assignment.id} selected={selectedId === assignment.id} className="grid min-h-16 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 py-2 lg:grid-cols-[2.25rem_minmax(15rem,1fr)_10rem_8rem_7rem_1.5rem] lg:gap-3"><button type="button" onClick={() => void onToggleCompleted(assignment)} disabled={updatingId === assignment.id} aria-label={assignment.is_completed ? `Mark ${assignment.title} incomplete` : `Mark ${assignment.title} complete`} className={cn("grid h-11 w-11 place-items-center rounded-md border border-border text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-8 lg:w-8", assignment.is_completed && "border-success/30 bg-success/10 text-success")}>{assignment.is_completed ? <Check className="h-4 w-4" /> : <span className="h-3 w-3 rounded-sm border border-current" />}</button><button type="button" onClick={() => onSelect(assignment)} className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className={cn("block truncate text-sm font-medium", assignment.is_completed && "text-muted-foreground line-through")}>{assignment.title}</span><span className="mt-0.5 block text-xs capitalize text-muted-foreground lg:hidden">{assignment.assignment_type ?? "Assignment"} · {assignment.course?.name ?? "Course"}</span></button><span className="hidden min-w-0 items-center gap-1.5 text-xs text-muted-foreground lg:flex"><span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: assignment.course?.color ?? "#83b9ff" }} /><span className="truncate">{assignment.course?.name ?? "Course"}</span></span><span className="hidden text-xs text-muted-foreground lg:block">{due ? format(due, "MMM d · p") : "—"}</span><span className="hidden lg:block"><StatusTag tone={state.tone}>{state.label}</StatusTag></span><button type="button" onClick={() => onSelect(assignment)} aria-label={`Open ${assignment.title}`} className="grid h-11 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-8"><ChevronRight className="h-4 w-4" /></button></DataRow>; })}</div>;
}

function AssignmentBoard({ assignments, now, onSelect }: { assignments: DashboardAssignment[]; now: Date; onSelect: (assignment: DashboardAssignment) => void }) {
  const columns = [{ label: "Pending", rows: assignments.filter((assignment) => !assignment.is_completed) }, { label: "Completed", rows: assignments.filter((assignment) => assignment.is_completed) }];
  return <div className="grid gap-px bg-border md:grid-cols-2">{columns.map((column) => <section key={column.label} className="min-w-0 bg-card p-3"><h3 className="mb-3 flex items-center justify-between px-1 text-xs font-semibold text-muted-foreground"><span>{column.label}</span><span>{column.rows.length}</span></h3><div className="space-y-2">{column.rows.length === 0 ? <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">No assignments</p> : column.rows.map((assignment) => { const state = assignmentStatus(assignment, now); return <button key={assignment.id} type="button" onClick={() => onSelect(assignment)} className="w-full rounded-lg border border-border bg-surface-1 p-3 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex items-start gap-2"><span className="mt-1 h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: assignment.course?.color ?? "#83b9ff" }} /><span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm font-medium">{assignment.title}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{assignment.course?.name ?? "Course"}</span></span></span><span className="mt-3 inline-flex"><StatusTag tone={state.tone}>{state.label}</StatusTag></span></button>; })}</div></section>)}</div>;
}

function AssignmentCalendar({ assignments, month, onMonthChange, onSelect }: { assignments: DashboardAssignment[]; month: Date; onMonthChange: (month: Date) => void; onSelect: (assignment: DashboardAssignment) => void }) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) });
  const monthAssignments = assignments.filter((assignment) => { const due = dueDate(assignment); return due && isSameMonth(due, month); });
  return <div><div className="flex items-center justify-between border-b border-border px-3 py-2"><button type="button" onClick={() => onMonthChange(subMonths(month, 1))} aria-label="Previous month" className="grid h-11 w-11 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground sm:h-9 sm:w-9"><ArrowLeft className="h-4 w-4" /></button><h3 className="text-sm font-semibold">{format(month, "MMMM yyyy")}</h3><button type="button" onClick={() => onMonthChange(addMonths(month, 1))} aria-label="Next month" className="grid h-11 w-11 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground sm:h-9 sm:w-9"><ArrowRight className="h-4 w-4" /></button></div><div className="hidden grid-cols-7 sm:grid">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => <div key={label} className="border-b border-r border-border px-2 py-2 text-[10px] font-medium text-muted-foreground last:border-r-0">{label}</div>)}{days.map((day, index) => { const dayRows = assignments.filter((assignment) => { const due = dueDate(assignment); return due && isSameDay(due, day); }); return <div key={day.toISOString()} className={cn("min-h-28 border-b border-r border-border p-1.5", index % 7 === 6 && "border-r-0", !isSameMonth(day, month) && "bg-background/30 text-muted-foreground/50")}><span className="px-1 text-[11px]">{format(day, "d")}</span><div className="mt-1 space-y-1">{dayRows.slice(0, 3).map((assignment) => <button key={assignment.id} type="button" onClick={() => onSelect(assignment)} className="block w-full truncate rounded px-1.5 py-1 text-left text-[10px] text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ borderLeft: `2px solid ${assignment.course?.color ?? "#83b9ff"}` }}>{assignment.title}</button>)}{dayRows.length > 3 ? <span className="block px-1 text-[10px] text-muted-foreground">+{dayRows.length - 3} more</span> : null}</div></div>; })}</div><div className="sm:hidden">{monthAssignments.length === 0 ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">No assignments in this month.</p> : monthAssignments.sort((left, right) => (dueDate(left)?.getTime() ?? 0) - (dueDate(right)?.getTime() ?? 0)).map((assignment) => <button key={assignment.id} type="button" onClick={() => onSelect(assignment)} className="flex min-h-14 w-full items-center gap-3 border-b border-border px-4 py-2 text-left last:border-b-0"><span className="w-12 text-xs font-medium text-muted-foreground">{format(dueDate(assignment) as Date, "MMM d")}</span><span className="min-w-0 flex-1 truncate text-sm">{assignment.title}</span><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>)}</div></div>;
}
