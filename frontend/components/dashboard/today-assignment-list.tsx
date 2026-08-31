"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { format, isSameDay, parseISO } from "date-fns";
import { ArrowUpRight, Check, ChevronRight, Clock3 } from "lucide-react";
import { cn } from "@/backend/utils";
import { AssignmentDocument } from "@/frontend/components/assignments/AssignmentDocument";
import { Button } from "@/frontend/components/ui/button";
import { SidePeek } from "@/frontend/components/workspace/side-peek";
import {
  DataRow,
  StatusTag,
  WorkspaceSectionHeader,
  WorkspaceSurface,
  WorkspaceToolbar,
} from "@/frontend/components/workspace/workspace-primitives";
import type { DashboardAssignment } from "./dashboard-types";

export type AssignmentFilter = "today" | "week" | "all" | "completed";

const DAY_MS = 86_400_000;

function validDueDate(value: string | null): Date | null {
  if (!value) return null;
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function assignmentState(assignment: DashboardAssignment, now: Date) {
  if (assignment.is_completed) return { label: "Completed", tone: "success" as const, group: "Completed" };
  const due = validDueDate(assignment.due_date);
  if (!due) return { label: "No due date", tone: "neutral" as const, group: "Later" };
  if (due.getTime() < now.getTime()) return { label: "Overdue", tone: "danger" as const, group: "Overdue" };
  if (isSameDay(due, now)) return { label: `Today · ${format(due, "p")}`, tone: "warning" as const, group: "Today" };
  return { label: format(due, "EEE, MMM d"), tone: "neutral" as const, group: "Upcoming" };
}

function matchesFilter(assignment: DashboardAssignment, filter: AssignmentFilter, now: Date) {
  if (filter === "completed") return assignment.is_completed;
  if (assignment.is_completed) return false;
  if (filter === "all") return true;
  const due = validDueDate(assignment.due_date);
  if (!due) return false;
  if (filter === "today") return due.getTime() < now.getTime() || isSameDay(due, now);
  return due.getTime() < now.getTime() + 7 * DAY_MS;
}

function sortAssignments(left: DashboardAssignment, right: DashboardAssignment) {
  const leftDue = validDueDate(left.due_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightDue = validDueDate(right.due_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return leftDue - rightDue || left.title.localeCompare(right.title);
}

export function TodayAssignmentList({
  assignments,
  filter,
  onFilterChange,
  selectedAssignment,
  onSelectAssignment,
  onCloseAssignment,
  onToggleCompleted,
  updatingId,
}: {
  assignments: DashboardAssignment[];
  filter: AssignmentFilter;
  onFilterChange: (filter: AssignmentFilter) => void;
  selectedAssignment: DashboardAssignment | null;
  onSelectAssignment: (assignment: DashboardAssignment) => void;
  onCloseAssignment: () => void;
  onToggleCompleted: (assignment: DashboardAssignment) => Promise<void>;
  updatingId: string | null;
}) {
  const [now] = useState(() => new Date());
  const visible = useMemo(
    () => assignments.filter((assignment) => matchesFilter(assignment, filter, now)).sort(sortAssignments),
    [assignments, filter, now]
  );
  const groups = useMemo(() => {
    const order = filter === "completed" ? ["Completed"] : ["Overdue", "Today", "Upcoming", "Later"];
    return order
      .map((label) => ({ label, assignments: visible.filter((assignment) => assignmentState(assignment, now).group === label) }))
      .filter((group) => group.assignments.length > 0);
  }, [filter, now, visible]);

  return (
    <>
      <WorkspaceSurface aria-label="My assignments">
        <WorkspaceSectionHeader
          title="My assignments"
          description="Ordered by urgency and due time"
          action={<Link href="/assignments" className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">View database</Link>}
        />
        <WorkspaceToolbar className="border-b border-border px-3 py-2 sm:px-4">
          <div className="flex min-w-0 gap-1 overflow-x-auto" role="group" aria-label="Filter assignments">
            {([
              ["today", "Today"],
              ["week", "This week"],
              ["all", "All"],
              ["completed", "Completed"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onFilterChange(value)}
                aria-pressed={filter === value}
                className={cn(
                  "min-h-10 shrink-0 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8",
                  filter === value && "bg-accent text-accent-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </WorkspaceToolbar>

        {groups.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <span className="mx-auto grid h-9 w-9 place-items-center rounded-md bg-success/10 text-success"><Check className="h-4 w-4" aria-hidden="true" /></span>
            <p className="mt-3 text-sm font-medium text-foreground">Nothing in this view</p>
            <p className="mt-1 text-xs text-muted-foreground">Choose another filter or use the open time for a study session.</p>
          </div>
        ) : (
          <div>
            {groups.map((group) => (
              <section key={group.label} aria-labelledby={`dashboard-assignment-group-${group.label}`}>
                <h3 id={`dashboard-assignment-group-${group.label}`} className="border-b border-border bg-surface-1/45 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {group.label} · {group.assignments.length}
                </h3>
                {group.assignments.slice(0, filter === "all" ? 10 : 7).map((assignment) => {
                  const state = assignmentState(assignment, now);
                  const due = validDueDate(assignment.due_date);
                  return (
                    <DataRow key={assignment.id} selected={selectedAssignment?.id === assignment.id} className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 py-2 sm:grid-cols-[2.25rem_minmax(0,1fr)_9rem_7rem_1.5rem] sm:gap-3">
                      <button
                        type="button"
                        onClick={() => void onToggleCompleted(assignment)}
                        disabled={updatingId === assignment.id}
                        aria-label={assignment.is_completed ? `Mark ${assignment.title} incomplete` : `Mark ${assignment.title} complete`}
                        className={cn(
                          "grid h-11 w-11 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:w-8",
                          assignment.is_completed && "border-success/30 bg-success/10 text-success"
                        )}
                      >
                        {assignment.is_completed ? <Check className="h-4 w-4" aria-hidden="true" /> : <span className="h-3 w-3 rounded-sm border border-current" aria-hidden="true" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectAssignment(assignment)}
                        className="min-w-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className={cn("block truncate text-sm font-medium text-foreground", assignment.is_completed && "text-muted-foreground line-through")}>{assignment.title}</span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: assignment.course?.color ?? "#83b9ff" }} aria-hidden="true" />
                          <span className="truncate">{assignment.course?.name ?? "Course"}</span>
                        </span>
                      </button>
                      <div className="hidden sm:block"><StatusTag tone={state.tone}>{state.label}</StatusTag></div>
                      <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                        {assignment.estimated_minutes ? <><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> {assignment.estimated_minutes} min</> : due ? format(due, "p") : "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectAssignment(assignment)}
                        className="grid h-11 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
                        aria-label={`Open details for ${assignment.title}`}
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </DataRow>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </WorkspaceSurface>

      <SidePeek
        open={Boolean(selectedAssignment)}
        onOpenChange={(open) => { if (!open) onCloseAssignment(); }}
        title={selectedAssignment?.title ?? "Assignment"}
        description={selectedAssignment?.course?.name ?? "Assignment details"}
        footer={selectedAssignment ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => void onToggleCompleted(selectedAssignment)} disabled={updatingId === selectedAssignment.id} className="h-11 sm:h-10">
              {selectedAssignment.is_completed ? "Mark incomplete" : "Mark complete"}
            </Button>
            <Button asChild className="h-11 sm:h-10">
              <Link href={`/practice${selectedAssignment.course?.id ? `?courseId=${encodeURIComponent(selectedAssignment.course.id)}` : ""}`}>Practice first</Link>
            </Button>
            {selectedAssignment.url ? (
              <Button asChild variant="outline" className="h-11 sm:h-10">
                <a href={selectedAssignment.url} target="_blank" rel="noreferrer">Open in Canvas <ArrowUpRight className="h-4 w-4" /></a>
              </Button>
            ) : null}
          </div>
        ) : undefined}
      >
        {selectedAssignment ? (
          <div className="space-y-6">
            <dl className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
              <div className="bg-card p-3"><dt className="text-xs text-muted-foreground">Due</dt><dd className="mt-1 text-sm font-medium text-foreground">{validDueDate(selectedAssignment.due_date) ? format(validDueDate(selectedAssignment.due_date) as Date, "PPp") : "No due date"}</dd></div>
              <div className="bg-card p-3"><dt className="text-xs text-muted-foreground">Status</dt><dd className="mt-1 text-sm font-medium text-foreground">{assignmentState(selectedAssignment, now).label}</dd></div>
              <div className="bg-card p-3"><dt className="text-xs text-muted-foreground">Type</dt><dd className="mt-1 text-sm font-medium capitalize text-foreground">{selectedAssignment.assignment_type ?? "Assignment"}</dd></div>
              <div className="bg-card p-3"><dt className="text-xs text-muted-foreground">Estimated effort</dt><dd className="mt-1 text-sm font-medium text-foreground">{selectedAssignment.estimated_minutes ? `${selectedAssignment.estimated_minutes} minutes` : "Not provided"}</dd></div>
            </dl>
            <section>
              <h3 className="text-sm font-semibold text-foreground">Instructions</h3>
              <div className="mt-3 rounded-lg border border-border bg-background/35 p-4">
                {selectedAssignment.description ? <AssignmentDocument html={selectedAssignment.description} /> : <p className="text-sm text-muted-foreground">No instructions were provided for this assignment.</p>}
              </div>
            </section>
          </div>
        ) : null}
      </SidePeek>
    </>
  );
}
