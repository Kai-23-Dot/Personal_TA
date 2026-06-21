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
      <Link href="/courses" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-white">
        <ArrowLeft className="h-4 w-4" /> All courses
      </Link>

      {/* Hero */}
      <div className="mb-8 rounded-3xl border border-white/10 bg-[rgba(9,12,24,0.82)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur">
        <div className="flex items-start gap-5">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-base font-bold text-[#05110b]"
            style={{ backgroundColor: course.color ?? "#8ab4ff" }}
          >
            {initialsFor(course.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-white">{course.name}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {[course.section, course.teacher_name].filter(Boolean).join(" · ") || "Synced course"}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
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
            <div key={label} className="rounded-xl border border-white/8 bg-white/3 p-3 text-center">
              <Icon className="mx-auto mb-1 h-4 w-4 text-slate-500" />
              <p className="text-xl font-bold text-white">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
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
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-sky-300">
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
                    urgent ? "border-orange-400/25 bg-orange-500/8" : "border-white/8 bg-white/3"
                  }`}
                >
                  {due && (
                    <div className={`flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 text-center w-12 shrink-0 ${urgent ? "bg-orange-500/15 text-orange-300" : "bg-sky-500/10 text-sky-300"}`}>
                      <span className="text-[9px] font-bold uppercase leading-none tracking-wider">{format(due, "MMM")}</span>
                      <span className="text-base font-bold leading-snug">{format(due, "d")}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{a.title}</p>
                    {a.assignment_type && (
                      <p className="text-xs text-slate-500 capitalize">{a.assignment_type}</p>
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
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            No due date · {noDueDate.length}
          </h2>
          <div className="space-y-2">
            {noDueDate.map((a) => (
              <div key={a.id} className="flex items-center gap-4 rounded-xl border border-white/8 bg-white/3 px-4 py-3">
                <BookOpen className="h-4 w-4 shrink-0 text-slate-600" />
                <p className="text-sm text-slate-300 truncate">{a.title}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {(assignments ?? []).length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/2 p-10 text-center">
          <BookOpen className="mx-auto mb-3 h-8 w-8 text-slate-600" />
          <p className="text-sm text-slate-400">No assignments synced for this course yet.</p>
          <Link href="/dashboard" className="btn btn-secondary mt-4">Sync from dashboard</Link>
        </div>
      )}
    </div>
  );
}
