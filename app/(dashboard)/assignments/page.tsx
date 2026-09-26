"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useChat } from "ai/react";
import { courseTone } from "@/frontend/lib/course-tone";
import { format, parseISO } from "date-fns";
import { Bot, CalendarClock, ChevronDown, FileText, Zap, X } from "lucide-react";
import { PageHero } from "@/frontend/components/ui/page-hero";
import { AssignmentDocument } from "@/frontend/components/assignments/AssignmentDocument";
import { useWorkspaceRefresh } from "@/frontend/lib/workspace-events";

type Assignment = {
  id: string;
  title: string;
  description: string | null;
  assignment_type: string;
  due_date: string | null;
  is_completed: boolean;
  course?: { name: string; color: string | null } | null;
  course_id: string | null;
};

type Course = {
  id: string;
  name: string;
  color: string | null;
};

function TypeBadge({ type }: { type: string }) {
  const t = (type ?? "").toLowerCase();
  const map: Record<string, string> = {
    quiz: "bg-[var(--blue-wash)] text-[var(--blue)] border-[var(--rule)]",
    test: "bg-[var(--blue-wash)] text-[var(--blue)] border-[var(--rule)]",
    exam: "bg-[var(--paper-sunken)] text-[var(--ink-muted)] border-[var(--rule)]",
    project: "bg-[var(--paper-sunken)] text-[var(--ink-muted)] border-[var(--rule)]",
    lab: "bg-[var(--success-bg)] text-[var(--success-ink)] border-[var(--success-ink)]",
  };
  const label = t ? t.charAt(0).toUpperCase() + t.slice(1) : "Assignment";
  const cls = map[t] ?? "bg-[var(--paper)] text-[var(--ink-muted)] border-[var(--rule)]";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function UrgencyLabel({ due }: { due: Date }) {
  const ms = due.getTime() - Date.now();
  const hours = ms / 3600000;
  if (hours < 0) return <span className="text-[11px] text-[var(--ink-muted)] font-medium">Past due</span>;
  if (hours < 24) return <span className="text-[11px] font-semibold text-[var(--danger-ink)]">Due today</span>;
  if (hours < 48) return <span className="text-[11px] font-semibold text-[var(--warning-ink)]">Due tomorrow</span>;
  return null;
}

function assignmentDescriptionToText(description: string | null): string {
  if (!description) return "No instructions available.";
  if (typeof document === "undefined") return description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const parsed = new DOMParser().parseFromString(description, "text/html");
  return (parsed.body.textContent ?? description).replace(/\s+/g, " ").trim();
}

/* Course colour comes from the shared tone system (frontend/lib/course-tone),
   not from the LMS-supplied hex: those are arbitrary per provider, clash on a
   light canvas, and differ from the colour the same course is given elsewhere
   in the app. The tone is applied with data-course-tone and read by the
   .course-* classes in app/notion-workspace.css. */

export default function AssignmentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCourseId = searchParams.get("course_id") ?? searchParams.get("courseId");
  const targetedAssignmentId = searchParams.get("assignmentId");

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "completed">("pending");
  const [sortOrder, setSortOrder] = useState<"due_asc" | "due_desc" | "title">("due_asc");
  const [summary, setSummary] = useState<{ id: string; text: string } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null);
  const [helperPrompt, setHelperPrompt] = useState("");
  const [syncRevision, setSyncRevision] = useState(0);

  const sessionId = useMemo(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return String(Date.now());
  }, []);

  const helperContext = useMemo(() => {
    if (!activeAssignment) return "";
    const mode =
      ["quiz", "test", "exam"].includes(activeAssignment.assignment_type)
        ? "multiple-choice or quiz-style assessment"
        : "written/typing assignment";
    return [
      `Assignment: ${activeAssignment.title}`,
      `Course: ${activeAssignment.course?.name ?? "Unknown"}`,
      `Type: ${activeAssignment.assignment_type} (${mode})`,
      `Instructions: ${assignmentDescriptionToText(activeAssignment.description)}`,
      "ASSIGNMENT COACH MODE (mandatory): Help the student learn without completing graded work. Do not provide a final answer, finished response, completed worksheet, or submission-ready text. Ask what they have tried, give one useful hint or concept explanation at a time, use questions to guide their reasoning, and offer feedback on the student's own attempt. If asked to do the assignment, politely redirect to the next step they can take themselves.",
    ].join("\n");
  }, [activeAssignment]);

  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } = useChat({
    api: "/api/chat/context",
    body: { sessionId, context: helperContext },
  });

  useWorkspaceRefresh(["assignments", "sync"], () =>
    setSyncRevision((revision) => revision + 1)
  );

  useEffect(() => {
    let mounted = true;
    setLoadingAssignments(true);
    setAssignmentsError(null);
    const url = selectedCourseId
      ? `/api/assignments?course_id=${encodeURIComponent(selectedCourseId)}`
      : "/api/assignments";

    Promise.all([
      fetch(url).then(async (res) => {
        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Failed to load");
        return Array.isArray(data) ? data : [];
      }),
      fetch("/api/courses").then(async (res) => {
        const data = await res.json().catch(() => []);
        return res.ok && Array.isArray(data) ? data : [];
      }),
    ])
      .then(([assignmentData, courseData]) => {
        if (!mounted) return;
        setAssignments(assignmentData);
        setCourses(courseData);
      })
      .catch((err) => {
        if (mounted) {
          setAssignments([]);
          setAssignmentsError(err instanceof Error ? err.message : "Failed to load assignments");
        }
      })
      .finally(() => { if (mounted) setLoadingAssignments(false); });

    return () => { mounted = false; };
  }, [selectedCourseId, syncRevision]);

  useEffect(() => {
    if (!selectedCourseId) return;
    setSummary(null);
    setHelperOpen(false);
    setActiveAssignment(null);
  }, [selectedCourseId]);

  const visibleAssignments = useMemo(() => {
    let result = selectedCourseId ? assignments.filter((a) => a.course_id === selectedCourseId) : assignments;
    if (statusFilter === "pending") result = result.filter((a) => !a.is_completed);
    else if (statusFilter === "completed") result = result.filter((a) => a.is_completed);
    if (sortOrder === "due_asc") {
      result = [...result].sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      });
    } else if (sortOrder === "due_desc") {
      result = [...result].sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(b.due_date).getTime() - new Date(a.due_date).getTime();
      });
    } else if (sortOrder === "title") {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title));
    }
    return result;
  }, [assignments, selectedCourseId, statusFilter, sortOrder]);

  useEffect(() => {
    if (!targetedAssignmentId || loadingAssignments) return;
    if (!visibleAssignments.some((assignment) => assignment.id === targetedAssignmentId)) return;

    setExpandedId(targetedAssignmentId);
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`assignment-${targetedAssignmentId}`)
        ?.closest("article")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadingAssignments, targetedAssignmentId, visibleAssignments]);

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === selectedCourseId) ?? null,
    [courses, selectedCourseId]
  );

  const dueThisWeek = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + 7 * 86400000);
    return visibleAssignments
      .filter((a) => a.due_date && !a.is_completed)
      .map((a) => ({ ...a, due: parseISO(a.due_date as string) }))
      .filter((a) => a.due >= now && a.due <= cutoff)
      .sort((a, b) => a.due.getTime() - b.due.getTime());
  }, [visibleAssignments]);

  const filterLabel = selectedCourse?.name ?? (selectedCourseId ? "Selected course" : "All courses");

  async function handleSummary(assignmentId: string) {
    setSummaryLoading(true);
    setSummary(null);
    const res = await fetch("/api/assignments/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId }),
    });
    const data = await res.json();
    if (res.ok && data?.summary) setSummary({ id: assignmentId, text: data.summary });
    setSummaryLoading(false);
  }

  async function handleQuiz(assignment: Assignment) {
    const res = await fetch("/api/practice/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: assignment.title,
        courseId: assignment.course_id,
        difficulty: "adaptive",
        questionCount: 8,
        assignmentId: assignment.id,
      }),
    });
    const data = await res.json();
    if (data?.sessionId) router.push(`/practice/session?sessionId=${data.sessionId}`);
  }

  function openHelper(assignment: Assignment) {
    setActiveAssignment(assignment);
    setMessages([]);
    const isQuizLike = ["quiz", "test", "exam"].includes(assignment.assignment_type);
    setHelperPrompt(
      isQuizLike
        ? "Show me the question and what you have tried so far."
        : "Tell me which part you are working on and share your attempt."
    );
    setHelperOpen(true);
  }

  const pillBase = "rounded-full border px-4 py-1.5 text-sm font-medium transition-all duration-200 whitespace-nowrap";
  const pillActive = "border-[var(--rule)] bg-[var(--blue-wash)] text-[var(--blue)]";
  const pillInactive = "border-[var(--rule)] bg-[var(--paper)] text-[var(--ink-muted)] hover:bg-[var(--wash-hover)] hover:text-[var(--ink)] hover:border-[var(--rule)]";

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-6">

      <PageHero
        className="mb-8"
        icon={CalendarClock}
        badgeLabel={selectedCourseId ? "Filtered by course" : "All synced coursework"}
        title="Assignments"
        description={
          selectedCourseId
            ? `Showing assignments for ${filterLabel}`
            : `${visibleAssignments.length} assignment${visibleAssignments.length !== 1 ? "s" : ""} across all courses`
        }
        action={
          <>
            {/* Status filter */}
            <div className="card flex p-0.5">
              {(["all", "pending", "completed"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                    statusFilter === s ? "bg-[var(--paper)] text-[var(--ink)] shadow" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            {/* Sort */}
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
              className="card px-2.5 py-1.5 text-xs text-[var(--ink-muted)] outline-none cursor-pointer"
            >
              <option value="due_asc">Due: earliest</option>
              <option value="due_desc">Due: latest</option>
              <option value="title">Title A–Z</option>
            </select>
            {selectedCourseId && (
              <Link href="/assignments" className="btn btn-secondary" style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem" }}>
                Clear filter
              </Link>
            )}
          </>
        }
      />

      {/* ── Course filter pills ── */}
      {courses.length > 0 ? (
        <div className="mb-7 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <Link href="/assignments" className={`${pillBase} ${!selectedCourseId ? pillActive : pillInactive}`}>
            All
          </Link>
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/assignments?course_id=${course.id}`}
              className={`${pillBase} ${selectedCourseId === course.id ? pillActive : pillInactive}`}
              data-course-tone={courseTone(course.name)}
            >
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: course.color ?? "#22d3ee" }}
                />
                {course.name}
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      {/* ── Due this week ── */}
      {!loadingAssignments && !assignmentsError && dueThisWeek.length > 0 ? (
        <section className="card mb-8 p-5 shadow-none backdrop-blur">
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-[var(--blue)]" />
            <h3 className="text-xs font-semibold text-[var(--blue)]">Due this week</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {dueThisWeek.map((a) => {
              const tone = courseTone(a.course?.name);
              return (
                <div
                  key={a.id}
                  className="course-card group flex cursor-default flex-col gap-1.5 p-4"
                  data-course-tone={tone}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--ink)] leading-snug">{a.title}</p>
                    <TypeBadge type={a.assignment_type} />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="inline-flex min-w-0 items-center gap-1.5 text-xs text-[var(--ink-muted)]">
                      <span className="course-dot" />
                      <span className="truncate">{a.course?.name ?? "Course"}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <UrgencyLabel due={a.due} />
                      <p className="text-xs text-[var(--ink-muted)]">{format(a.due, "MMM d")}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ── Assignment list ── */}
      {loadingAssignments ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton-shimmer h-20 rounded-2xl" aria-hidden="true" />
          ))}
        </div>
      ) : assignmentsError ? (
        <div className="rounded-2xl border border-[var(--danger-ink)] bg-[var(--danger-bg)] p-5 text-sm text-[var(--danger-ink)]">
          {assignmentsError}
        </div>
      ) : visibleAssignments.length === 0 ? (
        <div className="card border border-dashed p-10 text-center">
          <p className="text-[var(--ink-muted)]">
            {selectedCourseId
              ? `No assignments found for ${filterLabel}. Try selecting a different course.`
              : "No assignments yet. Sync Canvas from the dashboard to import your coursework."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleAssignments.map((assignment) => {
            const isExpanded = expandedId === assignment.id;
            const hasDue = Boolean(assignment.due_date);
            const due = hasDue ? parseISO(assignment.due_date as string) : null;
            const tone = courseTone(assignment.course?.name);

            return (
              <article
                key={assignment.id}
                className="course-card"
                data-course-tone={tone}
              >
                {/* Card header — always visible */}
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-controls={`assignment-${assignment.id}`}
                  className="flex w-full items-start gap-4 p-5 text-left transition-colors duration-150 active:bg-[var(--wash-hover)]"
                  onClick={() => setExpandedId(isExpanded ? null : assignment.id)}
                >
                  {/* Date chip */}
                  <div
                    className="course-date-chip"
                  >
                    {due ? (
                      <>
                        <span className="text-[10px] font-medium text-[var(--tone-ink)]">
                          {format(due, "MMM")}
                        </span>
                        <span className="mt-0.5 text-lg font-bold leading-none text-[var(--ink)]">
                          {format(due, "d")}
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] font-semibold text-[var(--ink-muted)]">No date</span>
                    )}
                  </div>

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-base font-medium text-[var(--ink)] leading-snug">{assignment.title}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <TypeBadge type={assignment.assignment_type} />
                        <ChevronDown
                          className={`h-4 w-4 text-[var(--ink-muted)] transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </div>
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="inline-flex min-w-0 items-center gap-2 text-sm text-[var(--ink-muted)]">
                        <span className="course-dot" />
                        <span className="truncate">{assignment.course?.name ?? "Course"}</span>
                      </span>
                      {due ? <UrgencyLabel due={due} /> : null}
                      {due ? (
                        <span className="text-xs text-[var(--ink-muted)]">{format(due, "p")}</span>
                      ) : null}
                    </div>
                  </div>
                </button>

                {/* Expandable content */}
                <div
                  id={`assignment-${assignment.id}`}
                  className={`grid transition-all duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <div className="overflow-hidden">
                    <div className="border-t border-[var(--rule)] px-5 pb-5 pt-4">
                      {assignment.description ? (
                        <section className="card mb-4 overflow-hidden">
                          <div className="flex items-center gap-2 border-b border-[var(--rule)] px-4 py-3">
                            <FileText className="h-4 w-4 text-[var(--blue)]" aria-hidden="true" />
                            <h3 className="text-xs font-semibold text-[var(--ink-muted)]">Assignment instructions</h3>
                          </div>
                          <div className="max-h-[65vh] overflow-auto p-4 sm:p-5 [scrollbar-width:thin]">
                            <AssignmentDocument html={assignment.description} />
                          </div>
                        </section>
                      ) : (
                        <p className="text-sm text-[var(--ink-muted)] italic mb-4">No description provided.</p>
                      )}

                      {/* Summary display */}
                      {summary?.id === assignment.id ? (
                        <div className="mb-4 rounded-xl border border-[var(--rule)] bg-[var(--blue-wash)] p-4">
                          <p className="text-xs font-semibold text-[var(--blue)] mb-2">AI Summary</p>
                          <p className="text-sm text-[var(--ink)] leading-relaxed whitespace-pre-wrap">{summary.text}</p>
                        </div>
                      ) : null}

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="btn btn-secondary active:scale-95 transition-transform duration-100"
                          onClick={() => handleSummary(assignment.id)}
                          disabled={summaryLoading}
                        >
                          {summaryLoading && summary?.id !== assignment.id ? "Generating..." : "Summary"}
                        </button>
                        <button
                          className="btn btn-secondary active:scale-95 transition-transform duration-100"
                          onClick={() => handleQuiz(assignment)}
                        >
                          Generate quiz
                        </button>
                        <button
                          className="btn btn-secondary !inline-flex items-center gap-2 active:scale-95 transition-transform duration-100"
                          onClick={() => openHelper(assignment)}
                        >
                          <Bot className="h-4 w-4" aria-hidden="true" />
                          Ask assignment coach
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ── Assignment helper chat ── */}
      {helperOpen ? (
        <aside
          aria-label="Assignment helper"
          className="card fixed bottom-5 right-5 z-[1200] flex w-[min(420px,calc(100vw-2rem))] flex-col shadow-none backdrop-blur"
        >
          <div className="flex items-center justify-between border-b border-[var(--rule)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">
                {activeAssignment ? activeAssignment.title : "Assignment helper"}
              </p>
              <p className="text-xs text-[var(--ink-muted)]">
                Guidance, explanations, and feedback—not completed work
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHelperOpen(false)}
              className="rounded-lg p-1.5 text-[var(--ink-muted)] transition-colors hover:bg-[var(--wash-hover)] hover:text-[var(--ink)] active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex max-h-[260px] flex-col gap-2 overflow-y-auto p-4 [scrollbar-width:thin]">
            {messages.length === 0 ? (
              <div className="rounded-xl border border-[var(--rule)] bg-[var(--blue-wash)] p-3">
                <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
                  Tell me where you are stuck and show what you have tried. I can explain the concept, offer a hint, or review your approach without completing the assignment for you.
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-xl border px-3 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "self-end border-[var(--rule)] bg-[var(--blue-wash)] text-[var(--blue)]"
                      : "self-start border-[var(--rule)] bg-[var(--paper)] text-[var(--ink)]"
                  }`}
                >
                  {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}
                </div>
              ))
            )}
            {isLoading ? <p className="text-xs text-[var(--ink-muted)]">Thinking...</p> : null}
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex gap-2 border-t border-[var(--rule)] p-3"
          >
            <input
              value={input}
              onChange={handleInputChange}
              placeholder={helperPrompt || "Ask for guidance..."}
              className="card flex-1 px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] outline-none focus:border-[var(--blue-edge)] focus:bg-[var(--blue-wash)] transition-colors"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary active:scale-95 transition-transform duration-100"
            >
              Send
            </button>
          </form>
        </aside>
      ) : null}
    </div>
  );
}
