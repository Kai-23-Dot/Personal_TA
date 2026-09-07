import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, CalendarDays, FileText, GraduationCap } from "lucide-react";
import { createClient } from "@/backend/supabase/server";
import { format, parseISO } from "date-fns";

type Params = { id: string };

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 3).map((p) => p[0]).join("").toUpperCase();
}

export default async function CourseDetailPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const [{ data: course }, { data: assignments }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, name, platform, teacher_name, section, color, updated_at, platform_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("assignments")
      .select("id, title, due_date, assignment_type, is_completed, description")
      .eq("course_id", id)
      .eq("user_id", user.id)
      .order("due_date", { ascending: true, nullsFirst: false }),
  ]);

  if (!course) notFound();

  const now = new Date();
  const upcoming = (assignments ?? []).filter((a) => !a.is_completed && a.due_date && new Date(a.due_date) >= now);
  const completed = (assignments ?? []).filter((a) => a.is_completed);
  const noDueDate = (assignments ?? []).filter((a) => !a.due_date && !a.is_completed);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-6">

      {/* Back */}
      <Link href="/courses" className="mb-6 inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] transition hover:text-[var(--ink)]">
        <ArrowLeft className="h-4 w-4" /> All courses
      </Link>

      {/* Hero */}
      <div className="mb-8 rounded-3xl border border-[var(--rule)] bg-[var(--paper)] p-6 shadow-none backdrop-blur">
        <div className="flex items-start gap-5">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-base font-bold text-[#05110b]"
            style={{ backgroundColor: course.color ?? "#8ab4ff" }}
          >
            {initialsFor(course.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">{course.name}</h1>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              {[course.section, course.teacher_name].filter(Boolean).join(" · ") || "Synced course"}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--ink-muted)]">
              <CalendarDays className="h-3.5 w-3.5" />
              Updated {new Date(course.updated_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { label: "Upcoming", value: upcoming.length, icon: CalendarDays },
            { label: "Completed", value: completed.length, icon: GraduationCap },
            { label: "Total", value: (assignments ?? []).length, icon: FileText },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="card p-3 text-center">
              <Icon className="mx-auto mb-1 h-4 w-4 text-[var(--ink-muted)]" />
              <p className="text-xl font-bold text-[var(--ink)]">{value}</p>
              <p className="text-xs text-[var(--ink-muted)]">{label}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={`/assignments?course_id=${course.id}`} className="btn btn-primary">
            View assignments
          </Link>
          <Link href={`/practice?course_id=${course.id}`} className="btn btn-secondary">
            Practice test
          </Link>
          <Link href={`/notes?course_id=${course.id}`} className="btn btn-secondary">
            Study guide
          </Link>
        </div>
      </div>

      {/* Upcoming assignments */}
      {upcoming.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--blue)]">
            Upcoming · {upcoming.length}
          </h2>
          <div className="space-y-2">
            {upcoming.map((a) => {
              const due = a.due_date ? parseISO(a.due_date) : null;
              const urgent = due && due.getTime() - Date.now() < 48 * 3_600_000;
              return (
                <div
                  key={a.id}
                  className={`flex items-center gap-4 rounded-xl border px-4 py-3 ${
                    urgent ? "border-[var(--warning-ink)] bg-[var(--warning-bg)]" : "border-[var(--rule)] bg-[var(--paper)]"
                  }`}
                >
                  {due && (
                    <div className={`flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 text-center w-12 shrink-0 ${urgent ? "bg-[var(--warning-bg)] text-[#533b1b]" : "bg-[var(--blue-wash)] text-[var(--blue)]"}`}>
                      <span className="text-[9px] font-bold leading-none">{format(due, "MMM")}</span>
                      <span className="text-base font-bold leading-snug">{format(due, "d")}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--ink)] truncate">{a.title}</p>
                    {a.assignment_type && (
                      <p className="text-xs text-[var(--ink-muted)] capitalize">{a.assignment_type}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* No due date */}
      {noDueDate.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--ink-muted)]">
            No due date · {noDueDate.length}
          </h2>
          <div className="space-y-2">
            {noDueDate.map((a) => (
              <div key={a.id} className="card flex items-center gap-4 px-4 py-3">
                <BookOpen className="h-4 w-4 shrink-0 text-[var(--ink-muted)]" />
                <p className="text-sm text-[var(--ink-muted)] truncate">{a.title}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {(assignments ?? []).length === 0 && (
        <div className="card border border-dashed p-10 text-center">
          <BookOpen className="mx-auto mb-3 h-8 w-8 text-[var(--ink-muted)]" />
          <p className="text-sm text-[var(--ink-muted)]">No assignments synced for this course yet.</p>
          <Link href="/dashboard" className="btn btn-secondary mt-4">Sync from dashboard</Link>
        </div>
      )}
    </div>
  );
}
