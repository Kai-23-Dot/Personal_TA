"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useChat } from "ai/react";
import { format, parseISO } from "date-fns";
import { CalendarClock, ChevronDown, Zap, X } from "lucide-react";
import { PageHero } from "@/frontend/components/ui/page-hero";

type Assignment = {
  id: string;
  title: string;
  description: string | null;
  assignment_type: string;
  due_date: string | null;
  is_completed: boolean;
  course?: { name: string } | null;
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
    quiz: "bg-sky-500/15 text-sky-300 border-sky-400/25",
    test: "bg-sky-500/15 text-sky-300 border-sky-400/25",
    exam: "bg-purple-500/15 text-purple-300 border-purple-400/25",
    project: "bg-violet-500/15 text-violet-300 border-violet-400/25",
    lab: "bg-emerald-500/15 text-emerald-300 border-emerald-400/25",
  };
  const label = t ? t.charAt(0).toUpperCase() + t.slice(1) : "Assignment";
  const cls = map[t] ?? "bg-white/10 text-slate-300 border-white/15";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function UrgencyLabel({ due }: { due: Date }) {
  const ms = due.getTime() - Date.now();
  const hours = ms / 3600000;
  if (hours < 0) return <span className="text-[11px] text-slate-500 font-medium">Past due</span>;
  if (hours < 24) return <span className="text-[11px] font-semibold text-red-400">Due today</span>;
  if (hours < 48) return <span className="text-[11px] font-semibold text-orange-400">Due tomorrow</span>;
  return null;
}

export default function AssignmentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCourseId = searchParams.get("course_id") ?? searchParams.get("courseId");

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
      `Description: ${activeAssignment.description ?? "No description available."}`,
      "Safety rule: Do not provide direct graded answers. Provide step-by-step guidance, hints, concept explanations, and review strategy.",
    ].join("\n");
  }, [activeAssignment]);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/chat/context",
    body: { sessionId, context: helperContext },
  });

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
  }, [selectedCourseId]);

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
    const isQuizLike = ["quiz", "test", "exam"].includes(assignment.assignment_type);
    setHelperPrompt(
      isQuizLike
        ? "Help me review this quiz topic with hints and elimination strategy."
        : "Help me outline and improve my response for this writing assignment."
    );
    setHelperOpen(true);
  }

  const pillBase = "rounded-full border px-4 py-1.5 text-sm font-medium transition-all duration-200 whitespace-nowrap";
  const pillActive = "border-sky-300/50 bg-sky-400/15 text-sky-100 shadow-[0_0_16px_rgba(56,189,248,0.12)]";
  const pillInactive = "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 hover:border-white/20";

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
            <div className="flex rounded-xl border border-white/10 bg-white/5 p-0.5">
              {(["all", "pending", "completed"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                    statusFilter === s ? "bg-white/10 text-white shadow" : "text-slate-400 hover:text-slate-200"
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
              className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 outline-none cursor-pointer"
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
        <section className="mb-8 rounded-2xl border border-sky-400/20 bg-[rgba(10,18,38,0.75)] p-5 shadow-[0_8px_40px_rgba(0,0,0,0.3)] backdrop-blur">
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-sky-300" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-sky-300">Due this week</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {dueThisWeek.map((a) => {
              const urgent = a.due.getTime() - Date.now() < 48 * 3600 * 1000;
              return (
                <div
                  key={a.id}
                  className={`group flex flex-col gap-1.5 rounded-xl border p-4 transition-all duration-200 hover:scale-[1.01] hover:shadow-lg cursor-default ${
                    urgent
                      ? "border-orange-400/35 bg-orange-500/8 hover:border-orange-400/55"
                      : "border-white/10 bg-white/5 hover:border-sky-400/30 hover:bg-sky-400/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-white leading-snug">{a.title}</p>
                    <TypeBadge type={a.assignment_type} />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">{a.course?.name ?? "Course"}</p>
                    <div className="flex items-center gap-2">
                      <UrgencyLabel due={a.due} />
                      <p className="text-xs text-slate-300">{format(a.due, "MMM d")}</p>
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
        <div className="rounded-2xl border border-red-400/20 bg-red-500/5 p-5 text-sm text-red-300">
          {assignmentsError}
        </div>
      ) : visibleAssignments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/3 p-10 text-center">
          <p className="text-slate-400">
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
            const urgent = due && due.getTime() - Date.now() < 48 * 3600 * 1000;

            return (
              <article
                key={assignment.id}
                className={`rounded-2xl border bg-[rgba(9,12,24,0.72)] backdrop-blur shadow-sm transition-all duration-200 ${
                  isExpanded
                    ? "border-sky-400/30 shadow-[0_4px_32px_rgba(56,189,248,0.08)]"
                    : urgent
                    ? "border-orange-400/25 hover:border-orange-400/45"
                    : "border-white/10 hover:border-white/20 hover:shadow-md"
                }`}
              >
                {/* Card header — always visible */}
                <button
                  type="button"
                  className="flex w-full items-start gap-4 p-5 text-left transition-colors duration-150 active:bg-white/[0.03]"
                  onClick={() => setExpandedId(isExpanded ? null : assignment.id)}
                >
                  {/* Date chip */}
                  <div
                    className={`flex flex-col items-center justify-center rounded-xl px-3 py-2 text-center flex-shrink-0 min-w-[52px] transition-colors duration-200 ${
                      urgent
                        ? "bg-orange-500/15 border border-orange-400/25"
                        : "bg-sky-500/10 border border-sky-400/15"
                    }`}
                  >
                    {due ? (
                      <>
                        <span className={`text-[10px] font-semibold uppercase tracking-wide ${urgent ? "text-orange-300" : "text-sky-300"}`}>
                          {format(due, "MMM")}
                        </span>
                        <span className={`text-lg font-bold leading-none mt-0.5 ${urgent ? "text-orange-100" : "text-white"}`}>
                          {format(due, "d")}
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400">No date</span>
                    )}
                  </div>

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-base font-medium text-white leading-snug">{assignment.title}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <TypeBadge type={assignment.assignment_type} />
                        <ChevronDown
                          className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </div>
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-sm text-slate-400">{assignment.course?.name ?? "Course"}</span>
                      {due ? <UrgencyLabel due={due} /> : null}
                      {due ? (
                        <span className="text-xs text-slate-500">{format(due, "p")}</span>
                      ) : null}
                    </div>
                  </div>
                </button>

                {/* Expandable content */}
                <div
                  className={`grid transition-all duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <div className="overflow-hidden">
                    <div className="border-t border-white/10 px-5 pb-5 pt-4">
                      {assignment.description ? (
                        <p className="text-sm text-slate-300 leading-relaxed mb-4">
                          {assignment.description}
                        </p>
                      ) : (
                        <p className="text-sm text-slate-500 italic mb-4">No description provided.</p>
                      )}

                      {/* Summary display */}
                      {summary?.id === assignment.id ? (
                        <div className="mb-4 rounded-xl border border-sky-400/20 bg-sky-500/5 p-4">
                          <p className="text-xs font-semibold text-sky-300 uppercase tracking-wider mb-2">AI Summary</p>
                          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{summary.text}</p>
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
                          className="btn btn-secondary active:scale-95 transition-transform duration-100"
                          onClick={() => openHelper(assignment)}
                        >
                          {["quiz", "test", "exam"].includes(assignment.assignment_type) ? "Quiz helper" : "Writing helper"}
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
          className="fixed bottom-5 right-5 z-[1200] flex w-[min(420px,calc(100vw-2rem))] flex-col rounded-2xl border border-white/15 bg-[rgba(8,14,28,0.97)] shadow-[0_24px_60px_rgba(0,0,0,0.65)] backdrop-blur"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">
                {activeAssignment ? activeAssignment.title : "Assignment helper"}
              </p>
              <p className="text-xs text-slate-400">
                {activeAssignment && ["quiz", "test", "exam"].includes(activeAssignment.assignment_type)
                  ? "Quiz review mode"
                  : "Writing support mode"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHelperOpen(false)}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex max-h-[260px] flex-col gap-2 overflow-y-auto p-4 [scrollbar-width:thin]">
            {messages.length === 0 ? (
              <p className="text-sm text-slate-500">Ask for help — no direct answers will be given.</p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-xl border px-3 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "self-end border-sky-400/25 bg-sky-500/15 text-sky-50"
                      : "self-start border-white/10 bg-white/5 text-slate-200"
                  }`}
                >
                  {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}
                </div>
              ))
            )}
            {isLoading ? <p className="text-xs text-slate-500">Thinking...</p> : null}
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex gap-2 border-t border-white/10 p-3"
          >
            <input
              value={input}
              onChange={handleInputChange}
              placeholder={helperPrompt || "Ask for guidance..."}
              className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-sky-400/40 focus:bg-sky-500/5 transition-colors"
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
