import Link from "next/link";
import { BarChart3, BookOpen, TrendingUp } from "lucide-react";
import { EmptyState } from "@/frontend/components/ui/empty-state";
import { createClient } from "@/backend/supabase/server";
import { PageHero } from "@/frontend/components/ui/page-hero";
import { GradesAutoSync } from "@/frontend/components/grades/grades-auto-sync";
import {
  GpaPredictor,
  type PredictorAssignment,
  type PredictorCourseSummary,
} from "@/frontend/components/grades/gpa-predictor";

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
};

function percent(earned: number, possible: number) {
  return Math.round((earned / possible) * 100);
}

export default async function GradesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: courses }, { data: gradeEvents }, { data: assignments }] = await Promise.all([
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
      .select("id, course_id, title, points_possible, weight, due_date, course:courses!inner(is_active)")
      .eq("user_id", user!.id)
      .eq("course.is_active", true)
      .eq("is_completed", false)
      .gte("due_date", new Date().toISOString())
      .order("due_date", { ascending: true })
      .limit(100),
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
  const predictorAssignments: PredictorAssignment[] = ((assignments ?? []) as unknown as AssignmentRow[]).map((assignment) => ({
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

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6">
      <PageHero
        className="mb-8"
        icon={TrendingUp}
        badgeLabel="Synced performance"
        title="Grade insights"
        description="Grades shown here come from your synced Canvas submissions."
        action={<GradesAutoSync />}
      />

      <GpaPredictor
        key={predictorKey}
        initialCourses={predictorCourses}
        upcomingAssignments={predictorAssignments}
      />

      <div className="mb-4 mt-10">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">Synced grade detail</h2>
        <p className="mt-1 text-sm text-slate-500">The real graded submissions currently available from Canvas.</p>
      </div>

      {activeCourses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses synced yet"
          description="Connect Canvas to import real courses, or use Add course above to calculate a manual GPA estimate."
          action={<Link href="/settings/setup/canvas" className="btn btn-primary">Connect Canvas</Link>}
        />
      ) : !hasGrades ? (
        <EmptyState
          icon={BarChart3}
          title="No synced grades yet"
          description="Your courses are available, but Smartlearn has not received graded submissions from Canvas yet."
          action={<Link href="/dashboard" className="btn btn-primary">Sync from dashboard</Link>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activeCourses.map((course) => {
            const total = totals.get(course.id);
            if (!total || total.count === 0 || total.possible <= 0) return null;
            const score = percent(total.earned, total.possible);
            return (
              <div key={course.id} className="rounded-2xl border border-white/10 bg-[rgba(9,12,24,0.74)] p-5 shadow-[0_8px_40px_rgba(1,6,20,0.35)]">
                <div className="flex items-center justify-between gap-4">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                    {course.platform === "canvas" ? "Canvas" : course.platform}
                  </span>
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: course.color ?? "#8ab4ff" }} />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-white">{course.name}</h2>
                <p className="mt-3 text-3xl font-semibold text-sky-200">{score}%</p>
                <p className="mt-1 text-sm text-slate-400">{total.count} graded item{total.count === 1 ? "" : "s"} synced</p>
                {total.latest ? (
                  <p className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                    Latest: {total.latest.notes ?? "Grade received"} · {new Date(total.latest.occurred_at).toLocaleDateString()}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
