import Link from "next/link";
import { BookOpen, TrendingUp } from "lucide-react";
import { EmptyState } from "@/frontend/components/ui/empty-state";
import { createClient } from "@/backend/supabase/server";
import { PageHero } from "@/frontend/components/ui/page-hero";
import { GradesAutoSync } from "@/frontend/components/grades/grades-auto-sync";
import {
  GpaPredictor,
  type PredictorAssignment,
  type PredictorCourseSummary,
} from "@/frontend/components/grades/gpa-predictor";
import { StatusTag, WorkspacePage, WorkspaceSectionHeader, WorkspaceSurface } from "@/frontend/components/workspace/workspace-primitives";

type CourseRow = {
  id: string;
  name: string;
  color: string | null;
  platform: string;
};

type GradeEventRow = {
  id: string;
  course_id: string;
  points_earned: number | null;
  points_possible: number | null;
  occurred_at: string;
  notes: string | null;
  course: { name: string; color: string | null } | { name: string; color: string | null }[] | null;
};

type AssignmentRow = {
  id: string;
  course_id: string;
  title: string;
  points_possible: number | null;
  weight: number | null;
  due_date: string | null;
  is_completed: boolean;
};

type SubmissionRow = { assignment_id: string; is_late: boolean };

function percent(earned: number, possible: number) {
  return Math.round((earned / possible) * 100);
}

export default async function GradesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: courses }, { data: gradeEvents }, { data: assignments }, { data: submissions }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, name, color, platform")
      .eq("user_id", user!.id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("grade_events")
      .select("id, course_id, points_earned, points_possible, occurred_at, notes, course:courses!inner(name, color, is_active)")
      .eq("user_id", user!.id)
      .eq("course.is_active", true)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("assignments")
      .select("id, course_id, title, points_possible, weight, due_date, is_completed, course:courses!inner(is_active)")
      .eq("user_id", user!.id)
      .eq("course.is_active", true)
      .order("due_date", { ascending: true })
      .limit(500),
    supabase.from("submissions").select("assignment_id, is_late").eq("user_id", user!.id),
  ]);

  const totals = new Map<string, { earned: number; possible: number; count: number; latest: GradeEventRow | null }>();
  for (const event of (gradeEvents ?? []) as unknown as GradeEventRow[]) {
    const current = totals.get(event.course_id) ?? { earned: 0, possible: 0, count: 0, latest: null };
    if (typeof event.points_earned === "number" && typeof event.points_possible === "number" && event.points_possible > 0) {
      current.earned += event.points_earned;
      current.possible += event.points_possible;
      current.count += 1;
    }
    if (!current.latest || new Date(event.occurred_at) > new Date(current.latest.occurred_at)) {
      current.latest = event;
    }
    totals.set(event.course_id, current);
  }

  const activeCourses = (courses ?? []) as CourseRow[];
  const hasGrades = [...totals.values()].some((total) => total.count > 0);
  const predictorCourses: PredictorCourseSummary[] = activeCourses.map((course) => {
    const total = totals.get(course.id);
    return {
      id: course.id,
      name: course.name,
      color: course.color,
      currentPercent: total && total.possible > 0 ? Math.round((total.earned / total.possible) * 10_000) / 100 : null,
      earnedPoints: total?.earned ?? 0,
      possiblePoints: total?.possible ?? 0,
      gradedItems: total?.count ?? 0,
    };
  });
  const predictorAssignments: PredictorAssignment[] = ((assignments ?? []) as unknown as AssignmentRow[])
    .filter((assignment) => !assignment.is_completed && assignment.due_date && new Date(assignment.due_date) >= new Date())
    .map((assignment) => ({
      id: assignment.id,
      courseId: assignment.course_id,
      title: assignment.title,
      pointsPossible: assignment.points_possible === null ? null : Number(assignment.points_possible),
      courseWeight: assignment.weight === null ? null : Number(assignment.weight),
      dueDate: assignment.due_date,
    }));
  const predictorKey = predictorCourses
    .map((course) => `${course.id}:${course.earnedPoints}:${course.possiblePoints}`)
    .join("|");
  const assignmentById = new Map(((assignments ?? []) as unknown as AssignmentRow[]).map((assignment) => [assignment.id, assignment]));
  const lateByCourse = new Map<string, number>();
  for (const submission of (submissions ?? []) as SubmissionRow[]) {
    if (!submission.is_late) continue;
    const assignment = assignmentById.get(submission.assignment_id);
    if (assignment) lateByCourse.set(assignment.course_id, (lateByCourse.get(assignment.course_id) ?? 0) + 1);
  }
  const pastDueByCourse = new Map<string, number>();
  for (const assignment of (assignments ?? []) as unknown as AssignmentRow[]) {
    if (!assignment.is_completed && assignment.due_date && new Date(assignment.due_date) < new Date()) pastDueByCourse.set(assignment.course_id, (pastDueByCourse.get(assignment.course_id) ?? 0) + 1);
  }
  const eventsByCourse = new Map<string, GradeEventRow[]>();
  for (const event of (gradeEvents ?? []) as unknown as GradeEventRow[]) {
    if (event.points_earned === null || event.points_possible === null || event.points_possible <= 0) continue;
    const events = eventsByCourse.get(event.course_id) ?? [];
    events.push(event);
    eventsByCourse.set(event.course_id, events);
  }

  return (
    <WorkspacePage wide className="space-y-5">
      <PageHero
        className=""
        icon={TrendingUp}
        badgeLabel="Synced performance"
        title="Grades"
        description="Synced Canvas grades, late work, and the next assignment likely to affect each course."
        action={<GradesAutoSync />}
      />

      {activeCourses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses synced yet"
          description="Connect Canvas to import real courses, or use Add course above to calculate a manual GPA estimate."
          action={<Link href="/settings/setup/canvas" className="btn btn-primary">Connect Canvas</Link>}
        />
      ) : (
        <WorkspaceSurface>
          <WorkspaceSectionHeader title="Course grades" description="Calculated only from graded points currently synced from Canvas" />
          <div className="hidden grid-cols-[minmax(15rem,1fr)_6rem_7rem_8rem_minmax(12rem,0.8fr)] gap-3 border-b border-border bg-surface-1/45 px-4 py-2 text-[11px] text-muted-foreground lg:grid"><span>Course</span><span>Grade</span><span>Latest result</span><span>Attention</span><span>What affects this next</span></div>
          {activeCourses.map((course) => {
            const total = totals.get(course.id);
            const score = total && total.count > 0 && total.possible > 0 ? percent(total.earned, total.possible) : null;
            const events = eventsByCourse.get(course.id) ?? [];
            const latestScore = events[0] && Number(events[0].points_possible) > 0 ? percent(Number(events[0].points_earned), Number(events[0].points_possible)) : null;
            const previousScore = events[1] && Number(events[1].points_possible) > 0 ? percent(Number(events[1].points_earned), Number(events[1].points_possible)) : null;
            const delta = latestScore !== null && previousScore !== null ? latestScore - previousScore : null;
            const next = predictorAssignments.find((assignment) => assignment.courseId === course.id);
            const attention = (pastDueByCourse.get(course.id) ?? 0) + (lateByCourse.get(course.id) ?? 0);
            return (
              <div key={course.id} className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 lg:grid-cols-[minmax(15rem,1fr)_6rem_7rem_8rem_minmax(12rem,0.8fr)]">
                <span className="flex min-w-0 items-center gap-2.5"><span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: course.color ?? "#83b9ff" }} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{course.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{score === null ? "Canvas has not provided enough graded points" : `${total?.count ?? 0} graded item${total?.count === 1 ? "" : "s"}`}</span></span></span>
                <span className="text-right text-sm font-semibold tabular-nums lg:text-left">{score === null ? "—" : `${score}%`}</span>
                <span className="hidden text-xs text-muted-foreground lg:block">{latestScore === null ? "Unavailable" : `${latestScore}%${delta === null ? "" : ` (${delta >= 0 ? "+" : ""}${delta} pts)`}`}</span>
                <span className="hidden lg:block">{attention > 0 ? <StatusTag tone="warning">{pastDueByCourse.get(course.id) ?? 0} past due · {lateByCourse.get(course.id) ?? 0} late</StatusTag> : <StatusTag tone="success">No flagged work</StatusTag>}</span>
                <span className="hidden truncate text-xs text-muted-foreground lg:block">{next ? `${next.title}${next.dueDate ? ` · ${new Date(next.dueDate).toLocaleDateString()}` : ""}` : "No upcoming graded assignment"}</span>
              </div>
            );
          })}
          {!hasGrades ? <p className="border-t border-border px-4 py-3 text-xs leading-5 text-muted-foreground">Current grades and trends remain unavailable until Canvas provides graded submissions. No estimate is substituted.</p> : null}
        </WorkspaceSurface>
      )}

      {activeCourses.length > 0 ? <details className="group rounded-lg border border-border bg-card"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">What-if grade planner <span className="ml-2 text-xs font-normal text-muted-foreground">Optional estimates; does not change synced grades</span></summary><div className="border-t border-border p-4"><GpaPredictor key={predictorKey} initialCourses={predictorCourses} upcomingAssignments={predictorAssignments} /></div></details> : null}
    </WorkspacePage>
  );
}
