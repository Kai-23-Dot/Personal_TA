"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { AssignmentCoach } from "@/frontend/components/assignments/assignment-coach";
import { AssignmentDatabase } from "@/frontend/components/assignments/assignment-database";
import type { DashboardAssignment, DashboardCourse } from "@/frontend/components/dashboard/dashboard-types";
import { Button } from "@/frontend/components/ui/button";
import { WorkspacePage, WorkspacePageHeader } from "@/frontend/components/workspace/workspace-primitives";

export default function AssignmentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCourseId = searchParams.get("course_id") ?? searchParams.get("courseId");
  const selectedAssignmentId = searchParams.get("assignmentId");
  const [assignments, setAssignments] = useState<DashboardAssignment[]>([]);
  const [courses, setCourses] = useState<DashboardCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ id: string; text: string } | null>(null);
  const [summaryLoadingId, setSummaryLoadingId] = useState<string | null>(null);
  const [coachAssignment, setCoachAssignment] = useState<DashboardAssignment | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("smartlearn:sync-complete", refresh);
    return () => window.removeEventListener("smartlearn:sync-complete", refresh);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      fetch("/api/assignments").then(async (response) => { const data = await response.json().catch(() => []); if (!response.ok) throw new Error(data?.error ?? "Failed to load assignments."); return Array.isArray(data) ? data : []; }),
      fetch("/api/courses").then(async (response) => { const data = await response.json().catch(() => []); return response.ok && Array.isArray(data) ? data : []; }),
    ]).then(([assignmentData, courseData]) => {
      if (!active) return;
      setAssignments(assignmentData);
      setCourses(courseData);
    }).catch((error) => {
      if (!active) return;
      setAssignments([]);
      setLoadError(error instanceof Error ? error.message : "Failed to load assignments.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  const selectedAssignment = assignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null;

  function openAssignment(assignment: DashboardAssignment) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("assignmentId", assignment.id);
    router.push(`/assignments?${params.toString()}`, { scroll: false });
  }

  function closeAssignment() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("assignmentId");
    router.replace(params.size ? `/assignments?${params.toString()}` : "/assignments", { scroll: false });
  }

  async function toggleCompleted(assignment: DashboardAssignment) {
    const next = !assignment.is_completed;
    setUpdatingId(assignment.id);
    setActionError(null);
    setAssignments((current) => current.map((item) => item.id === assignment.id ? { ...item, is_completed: next } : item));
    try {
      const response = await fetch("/api/assignments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: assignment.id, is_completed: next }) });
      if (!response.ok) throw new Error("The assignment status could not be updated.");
    } catch (error) {
      setAssignments((current) => current.map((item) => item.id === assignment.id ? { ...item, is_completed: assignment.is_completed } : item));
      setActionError(error instanceof Error ? error.message : "The assignment status could not be updated.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function summarize(assignment: DashboardAssignment) {
    setSummaryLoadingId(assignment.id);
    setActionError(null);
    try {
      const response = await fetch("/api/assignments/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignmentId: assignment.id }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.summary) throw new Error(data?.error ?? "The assignment could not be summarized.");
      setSummary({ id: assignment.id, text: data.summary });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The assignment could not be summarized.");
    } finally {
      setSummaryLoadingId(null);
    }
  }

  async function generateQuiz(assignment: DashboardAssignment) {
    setActionError(null);
    try {
      const response = await fetch("/api/practice/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: assignment.title, courseId: assignment.course_id ?? assignment.course?.id ?? null, difficulty: "adaptive", questionCount: 8, assignmentId: assignment.id }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.sessionId) throw new Error(data?.error ?? "Practice generation failed. Please try again.");
      router.push(`/practice/session?sessionId=${encodeURIComponent(data.sessionId)}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Practice generation failed. Please try again.");
    }
  }

  function openCoach(assignment: DashboardAssignment) {
    setCoachAssignment(assignment);
    setCoachOpen(true);
  }

  return (
    <WorkspacePage wide>
      <WorkspacePageHeader icon={CalendarClock} eyebrow="Learn" title="Assignments" description="One database for every current Canvas assignment, ordered and filtered around the work that needs attention." meta={<span>{assignments.length} synced assignment{assignments.length === 1 ? "" : "s"}</span>} />
      <div className="mt-5">
        {loading ? <div className="space-y-3" role="status" aria-label="Loading assignments"><div className="skeleton-shimmer h-16 rounded-lg" />{[1, 2, 3, 4].map((item) => <div key={item} className="skeleton-shimmer h-16 rounded-lg" />)}</div> : loadError ? <div className="rounded-lg border border-danger/25 bg-danger/10 px-5 py-8 text-center"><p className="text-sm text-danger">{loadError}</p><Button className="mt-4" onClick={() => setRevision((value) => value + 1)}>Retry</Button></div> : <AssignmentDatabase assignments={assignments} courses={courses} initialCourseId={initialCourseId} selectedAssignment={selectedAssignment} onSelectAssignment={openAssignment} onCloseAssignment={closeAssignment} onToggleCompleted={toggleCompleted} updatingId={updatingId} summary={summary} summaryLoadingId={summaryLoadingId} actionError={actionError} onSummary={summarize} onQuiz={generateQuiz} onCoach={openCoach} />}
      </div>
      <AssignmentCoach assignment={coachAssignment} open={coachOpen} onOpenChange={setCoachOpen} />
    </WorkspacePage>
  );
}
