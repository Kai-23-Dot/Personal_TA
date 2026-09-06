import Link from "next/link";
import { BookOpen, CalendarDays, RefreshCw, Sparkles } from "lucide-react";
import { courseTone } from "@/frontend/lib/course-tone";
import { EmptyState } from "@/frontend/components/ui/empty-state";
import { createClient } from "@/backend/supabase/server";
import { PageHero } from "@/frontend/components/ui/page-hero";
import { Button } from "@/frontend/components/ui/button";

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
      <PageHero
        className="mb-2"
        icon={Sparkles}
        badgeLabel="Canvas courses"
        title="Courses"
        description="Your active courses pulled from Canvas. Run a sync to keep them up to date."
        action={
          <>
            <Button variant="secondary" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <Button asChild>
              <Link href="/settings/setup/canvas">{canvasConnection ? "Manage Canvas" : "Connect Canvas"}</Link>
            </Button>
          </>
        }
      />
      <div className="mb-8">
        {canvasConnection?.last_synced_at ? (
          <p className="text-xs text-[var(--ink-muted)]">
            Last Canvas sync: {new Date(canvasConnection.last_synced_at).toLocaleString()}
          </p>
        ) : null}
      </div>

      {(courses ?? []).length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={canvasConnection ? "No synced courses yet" : "Connect Canvas to import courses"}
          description={
            canvasConnection
              ? "Canvas is connected, but no active courses were imported. Run a sync from the dashboard to pull the latest Canvas classes."
              : "Connect your school’s Canvas account to import its active courses here."
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
                className="group rounded-2xl border border-[var(--rule)] bg-[var(--paper)] p-5 shadow-none transition hover:-translate-y-0.5 hover:border-[var(--blue-edge)] hover:bg-[var(--blue-wash)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div
                    className="course-avatar"
                    data-course-tone={courseTone(course.name)}
                  >
                    {initialsFor(course.name)}
                  </div>
                  <span className="rounded-full border border-[var(--rule)] bg-[var(--paper)] px-2.5 py-1 text-xs text-[var(--ink-muted)]">
                    {course.platform === "canvas" ? "Canvas" : course.platform}
                  </span>
                </div>
                <h2 className="mt-5 text-lg font-semibold text-[var(--ink)] group-hover:text-[var(--blue)]">{course.name}</h2>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  {[course.section, course.teacher_name].filter(Boolean).join(" · ") || "Synced course"}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-3">
                    <p className="text-lg font-semibold text-[var(--ink)]">{counts.total}</p>
                    <p className="text-xs text-[var(--ink-muted)]">assignments</p>
                  </div>
                  <div className="rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-3">
                    <p className="text-lg font-semibold text-[var(--ink)]">{counts.upcoming}</p>
                    <p className="text-xs text-[var(--ink-muted)]">upcoming</p>
                  </div>
                </div>
                <p className="mt-4 inline-flex items-center gap-2 text-xs text-[var(--ink-muted)]">
                  <CalendarDays className="h-3.5 w-3.5" /> Updated {new Date(course.updated_at).toLocaleDateString()}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <Link href="/dashboard" className="rounded-2xl border border-[var(--rule)] bg-card/70 p-5 transition hover:border-[var(--blue-edge)] hover:bg-[var(--blue-wash)]">
          <RefreshCw className="mb-3 h-5 w-5 text-[var(--blue)]" />
          <h2 className="text-lg font-semibold text-[var(--ink)]">Sync content</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Pull updated Canvas courses, assignments, modules, files, and notes.</p>
        </Link>
        <Link href="/practice" className="rounded-2xl border border-[var(--rule)] bg-card/70 p-5 transition hover:border-[var(--blue-edge)] hover:bg-[var(--blue-wash)]">
          <BookOpen className="mb-3 h-5 w-5 text-[var(--blue)]" />
          <h2 className="text-lg font-semibold text-[var(--ink)]">Generate practice</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">Use synced course materials to build source-grounded practice tests.</p>
        </Link>
      </section>
    </div>
  );
}
