import Link from "next/link";
import { BookOpen, CalendarDays, RefreshCw, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";

type CourseRow = {
  id: string;
  name: string;
  platform: string;
  platform_id: string | null;
  teacher_name: string | null;
  section: string | null;
  color: string | null;
  updated_at: string;
};

type AssignmentRow = {
  id: string;
  course_id: string;
  due_date: string | null;
  is_completed: boolean;
};

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default async function CoursesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: courses }, { data: assignments }, { data: canvasConnection }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, name, platform, platform_id, teacher_name, section, color, updated_at")
      .eq("user_id", user!.id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("assignments")
      .select("id, course_id, due_date, is_completed")
      .eq("user_id", user!.id),
    supabase
      .from("lms_connections")
      .select("id, last_synced_at, canvas_domain")
      .eq("user_id", user!.id)
      .eq("platform", "canvas")
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  const assignmentCounts = new Map<string, { total: number; upcoming: number }>();
  const now = Date.now();
  for (const assignment of (assignments ?? []) as AssignmentRow[]) {
    const current = assignmentCounts.get(assignment.course_id) ?? { total: 0, upcoming: 0 };
    current.total += 1;
    if (assignment.due_date && !assignment.is_completed && new Date(assignment.due_date).getTime() >= now) {
      current.upcoming += 1;
    }
    assignmentCounts.set(assignment.course_id, current);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6">
      <section className="mb-8 rounded-3xl border border-sky-400/15 bg-[rgba(12,15,27,0.82)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-100">
              <Sparkles className="h-3.5 w-3.5" /> Canvas courses
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-white">Courses</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Your active courses pulled from Canvas. Run a sync to keep them up to date.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard" className="btn btn-secondary">Dashboard</Link>
            <Link href="/settings/setup/canvas" className="btn btn-primary">
              {canvasConnection ? "Manage Canvas" : "Connect Canvas"}
            </Link>
          </div>
        </div>
        {canvasConnection?.last_synced_at ? (
          <p className="mt-4 text-xs text-slate-400">
            Last Canvas sync: {new Date(canvasConnection.last_synced_at).toLocaleString()}
          </p>
        ) : null}
      </section>

      {(courses ?? []).length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={canvasConnection ? "No synced courses yet" : "Connect Canvas to import courses"}
          description={
            canvasConnection
              ? "Canvas is connected, but no active courses were imported. Run a sync from the dashboard to pull the latest Canvas classes."
              : "Once Canvas is connected, this page will show your real courses instead of placeholder content."
          }
          action={
            <Link href={canvasConnection ? "/dashboard" : "/settings/setup/canvas"} className="btn btn-primary">
              {canvasConnection ? "Run sync from dashboard" : "Connect Canvas"}
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {((courses ?? []) as CourseRow[]).map((course) => {
            const counts = assignmentCounts.get(course.id) ?? { total: 0, upcoming: 0 };
            return (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className="group rounded-2xl border border-white/10 bg-[rgba(9,12,24,0.74)] p-5 shadow-[0_8px_40px_rgba(1,6,20,0.35)] transition hover:-translate-y-0.5 hover:border-sky-300/35 hover:bg-sky-400/5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-2xl text-sm font-semibold text-[#05110b]"
                    style={{ backgroundColor: course.color ?? "#8ab4ff" }}
                  >
                    {initialsFor(course.name)}
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
                    {course.platform === "canvas" ? "Canvas" : course.platform}
                  </span>
                </div>
                <h2 className="mt-5 text-lg font-semibold text-white group-hover:text-sky-100">{course.name}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {[course.section, course.teacher_name].filter(Boolean).join(" · ") || "Synced course"}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-lg font-semibold text-white">{counts.total}</p>
                    <p className="text-xs text-slate-400">assignments</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-lg font-semibold text-white">{counts.upcoming}</p>
                    <p className="text-xs text-slate-400">upcoming</p>
                  </div>
                </div>
                <p className="mt-4 inline-flex items-center gap-2 text-xs text-slate-400">
                  <CalendarDays className="h-3.5 w-3.5" /> Updated {new Date(course.updated_at).toLocaleDateString()}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <Link href="/dashboard" className="rounded-2xl border border-white/10 bg-card/70 p-5 transition hover:border-sky-300/35 hover:bg-sky-400/5">
          <RefreshCw className="mb-3 h-5 w-5 text-sky-300" />
          <h2 className="text-lg font-semibold text-white">Sync content</h2>
          <p className="mt-1 text-sm text-slate-400">Pull updated Canvas courses, assignments, modules, files, and notes.</p>
        </Link>
        <Link href="/practice" className="rounded-2xl border border-white/10 bg-card/70 p-5 transition hover:border-sky-300/35 hover:bg-sky-400/5">
          <BookOpen className="mb-3 h-5 w-5 text-sky-300" />
          <h2 className="text-lg font-semibold text-white">Generate practice</h2>
          <p className="mt-1 text-sm text-slate-400">Use synced course materials to build source-grounded practice tests.</p>
        </Link>
      </section>
    </div>
  );
}
