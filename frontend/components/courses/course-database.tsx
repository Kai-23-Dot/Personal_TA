"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { BookOpen, ChevronRight, Grid2X2, List, Search } from "lucide-react";
import { cn } from "@/backend/utils";
import { StatusTag, WorkspaceSurface, WorkspaceToolbar } from "@/frontend/components/workspace/workspace-primitives";

export type CourseDatabaseRow = {
  id: string;
  name: string;
  teacherName: string | null;
  section: string | null;
  term: string;
  color: string | null;
  active: boolean;
  platform: string;
  nextDeadline: string | null;
  upcomingCount: number;
  indexedCount: number;
  gradePercent: number | null;
};

type CourseView = "list" | "gallery";
type CourseScope = "active" | "archived";
const VIEW_KEY = "smartlearn:courses:view";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 3).map((part) => part[0]).join("").toUpperCase();
}

export function CourseDatabase({ courses }: { courses: CourseDatabaseRow[] }) {
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("all");
  const [scope, setScope] = useState<CourseScope>("active");
  const [view, setView] = useState<CourseView>("list");

  useEffect(() => {
    try {
      if (window.localStorage.getItem(VIEW_KEY) === "gallery") setView("gallery");
    } catch {}
  }, []);

  const terms = useMemo(() => Array.from(new Set(courses.map((course) => course.term).filter(Boolean))).sort(), [courses]);
  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return courses.filter((course) => {
      if ((scope === "active") !== course.active) return false;
      if (term !== "all" && course.term !== term) return false;
      return !normalizedQuery || [course.name, course.teacherName, course.section, course.term].some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [courses, query, scope, term]);

  function changeView(next: CourseView) {
    setView(next);
    try { window.localStorage.setItem(VIEW_KEY, next); } catch {}
  }

  return (
    <WorkspaceSurface>
      <div className="border-b border-border p-3 sm:p-4">
        <WorkspaceToolbar>
          <label className="relative min-w-0 flex-1 sm:max-w-sm">
            <span className="sr-only">Search courses</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search courses…" className="h-11 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring sm:h-10" />
          </label>
          <select value={term} onChange={(event) => setTerm(event.target.value)} aria-label="Filter courses by term" className="h-11 min-w-36 rounded-md border border-input bg-card px-3 text-sm text-foreground sm:h-10">
            <option value="all">All terms</option>
            {terms.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <div className="flex h-11 items-center rounded-md border border-border p-1 sm:h-10" role="group" aria-label="Course state">
            {(["active", "archived"] as const).map((value) => <button key={value} type="button" onClick={() => setScope(value)} aria-pressed={scope === value} className={cn("h-8 rounded px-2.5 text-xs font-medium capitalize text-muted-foreground hover:text-foreground", scope === value && "bg-accent text-accent-foreground")}>{value}</button>)}
          </div>
          <div className="ml-auto flex h-11 items-center rounded-md border border-border p-1 sm:h-10" role="group" aria-label="Course view">
            <button type="button" onClick={() => changeView("list")} aria-label="List view" aria-pressed={view === "list"} className={cn("grid h-8 w-8 place-items-center rounded text-muted-foreground hover:text-foreground", view === "list" && "bg-accent text-accent-foreground")}><List className="h-4 w-4" /></button>
            <button type="button" onClick={() => changeView("gallery")} aria-label="Gallery view" aria-pressed={view === "gallery"} className={cn("grid h-8 w-8 place-items-center rounded text-muted-foreground hover:text-foreground", view === "gallery" && "bg-accent text-accent-foreground")}><Grid2X2 className="h-4 w-4" /></button>
          </div>
        </WorkspaceToolbar>
      </div>

      {visible.length === 0 ? (
        <div className="px-5 py-14 text-center"><BookOpen className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium text-foreground">No {scope} courses match</p><p className="mt-1 text-xs text-muted-foreground">Adjust the search or term filter.</p></div>
      ) : view === "list" ? (
        <div>
          <div className="hidden grid-cols-[minmax(18rem,1fr)_9rem_9rem_7rem_5rem_1.5rem] gap-3 border-b border-border bg-surface-1/45 px-4 py-2 text-[11px] font-medium text-muted-foreground lg:grid">
            <span>Course</span><span>Term</span><span>Next deadline</span><span>Materials</span><span>Grade</span><span />
          </div>
          {visible.map((course) => (
            <Link key={course.id} href={`/courses/${course.id}`} className="group grid min-h-16 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:grid-cols-[minmax(18rem,1fr)_9rem_9rem_7rem_5rem_1.5rem]">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[10px] font-bold text-[#07101e]" style={{ backgroundColor: course.color ?? "#83b9ff" }}>{initials(course.name)}</span>
                <span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground">{course.name}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{[course.section, course.teacherName].filter(Boolean).join(" · ") || (course.platform === "canvas" ? "Canvas course" : "Course")}</span></span>
              </span>
              <span className="hidden truncate text-xs text-muted-foreground lg:block">{course.term || "—"}</span>
              <span className="hidden text-xs text-muted-foreground lg:block">{course.nextDeadline ? format(parseISO(course.nextDeadline), "MMM d") : "Clear"}</span>
              <span className="hidden lg:block"><StatusTag tone={course.indexedCount > 0 ? "success" : "neutral"}>{course.indexedCount > 0 ? `${course.indexedCount} indexed` : "Not indexed"}</StatusTag></span>
              <span className="hidden text-xs font-medium tabular-nums text-foreground lg:block">{course.gradePercent === null ? "—" : `${course.gradePercent}%`}</span>
              <span className="lg:hidden"><StatusTag tone={course.nextDeadline ? "accent" : "neutral"}>{course.nextDeadline ? format(parseISO(course.nextDeadline), "MMM d") : "Clear"}</StatusTag></span>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((course) => (
            <Link key={course.id} href={`/courses/${course.id}`} className="group min-w-0 bg-card p-4 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-[10px] font-bold text-[#07101e]" style={{ backgroundColor: course.color ?? "#83b9ff" }}>{initials(course.name)}</span><span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm font-medium text-foreground">{course.name}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{course.term || course.section || "Current course"}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-muted-foreground">Upcoming</dt><dd className="mt-1 font-medium text-foreground">{course.upcomingCount}</dd></div><div><dt className="text-muted-foreground">Materials</dt><dd className="mt-1 font-medium text-foreground">{course.indexedCount}</dd></div><div><dt className="text-muted-foreground">Grade</dt><dd className="mt-1 font-medium text-foreground">{course.gradePercent === null ? "—" : `${course.gradePercent}%`}</dd></div></dl>
            </Link>
          ))}
        </div>
      )}
    </WorkspaceSurface>
  );
}
