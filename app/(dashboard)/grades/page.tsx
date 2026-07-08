import Link from "next/link";
import { BarChart3, BookOpen, TrendingUp } from "lucide-react";
import { EmptyState } from "@/frontend/components/ui/empty-state";
import { createClient } from "@/backend/supabase/server";
import { PageHero } from "@/frontend/components/ui/page-hero";

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

function percent(earned: number, possible: number) {
  return Math.round((earned / possible) * 100);
}

export default async function GradesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: courses }, { data: gradeEvents }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, name, color, platform")
      .eq("user_id", user!.id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("grade_events")
      .select("id, course_id, points_earned, points_possible, occurred_at, notes, course:courses(name, color)")
      .eq("user_id", user!.id)
      .order("occurred_at", { ascending: false }),
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

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6">
      <PageHero
        className="mb-8"
        icon={TrendingUp}
        badgeLabel="Synced performance"
        title="Grade insights"
        description="Grades shown here come from your synced Canvas submissions."
      />

      {activeCourses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses synced yet"
          description="Connect Canvas or run a sync to import real courses before grade insights can be shown."
          action={<Link href="/settings/setup/canvas" className="btn btn-primary">Connect Canvas</Link>}
        />
      ) : !hasGrades ? (
        <EmptyState
          icon={BarChart3}
          title="No synced grades yet"
          description="Your courses are available, but Conlearn has not received graded submissions from Canvas yet."
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
