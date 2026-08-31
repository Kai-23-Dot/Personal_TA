import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ArrowRight, BookOpen, CalendarDays, FileText, GraduationCap, Layers3, TrendingUp } from "lucide-react";
import { createClient } from "@/backend/supabase/server";
import { Button } from "@/frontend/components/ui/button";
import {
  StatusTag,
  WorkspacePage,
  WorkspacePageHeader,
  WorkspaceSectionHeader,
  WorkspaceSurface,
} from "@/frontend/components/workspace/workspace-primitives";

type Params = { id: string };
type AssignmentRow = { id: string; title: string; due_date: string | null; assignment_type: string | null; is_completed: boolean };
type NoteRow = { id: string; title: string | null; file_name: string | null; unit_name: string | null; updated_at: string };
type GradeRow = { points_earned: number | null; points_possible: number | null };

export default async function CourseDetailPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const [{ data: course }, { data: assignments }, { data: notes }, { data: grades }] = await Promise.all([
    supabase.from("courses").select("id, name, platform, teacher_name, section, color, updated_at, academic_year, semester, is_active").eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("assignments").select("id, title, due_date, assignment_type, is_completed").eq("course_id", id).eq("user_id", user.id).order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("notes").select("id, title, file_name, unit_name, updated_at").eq("course_id", id).eq("user_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("grade_events").select("points_earned, points_possible").eq("course_id", id).eq("user_id", user.id),
  ]);
  if (!course) notFound();

  const now = new Date();
  const upcoming = ((assignments ?? []) as AssignmentRow[]).filter((assignment) => !assignment.is_completed && assignment.due_date && new Date(assignment.due_date) >= now);
  const completedCount = ((assignments ?? []) as AssignmentRow[]).filter((assignment) => assignment.is_completed).length;
  const gradeTotal = ((grades ?? []) as GradeRow[]).reduce((total, grade) => {
    if (grade.points_earned !== null && grade.points_possible !== null && grade.points_possible > 0) {
      total.earned += Number(grade.points_earned);
      total.possible += Number(grade.points_possible);
    }
    return total;
  }, { earned: 0, possible: 0 });
  const gradePercent = gradeTotal.possible > 0 ? Math.round((gradeTotal.earned / gradeTotal.possible) * 1000) / 10 : null;
  const term = [course.semester, course.academic_year].filter(Boolean).join(" · ") || "Current term";

  const courseLinks = [
    { label: "Overview", href: `/courses/${course.id}`, icon: BookOpen },
    { label: "Assignments", href: `/assignments?course_id=${course.id}`, icon: CalendarDays },
    { label: "Materials & notes", href: `/notes?course_id=${course.id}`, icon: FileText },
    { label: "Practice", href: `/practice?course_id=${course.id}`, icon: Layers3 },
    { label: "Grades", href: "/grades", icon: TrendingUp },
  ];

  return (
    <WorkspacePage>
      <WorkspacePageHeader
        icon={GraduationCap}
        breadcrumbs={[{ label: "Courses", href: "/courses" }, { label: course.name }]}
        eyebrow={term}
        title={course.name}
        description={[course.section, course.teacher_name].filter(Boolean).join(" · ") || "Synced course workspace"}
        meta={<><StatusTag tone={course.is_active ? "success" : "neutral"}>{course.is_active ? "Active" : "Archived"}</StatusTag><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ backgroundColor: course.color ?? "#83b9ff" }} />Updated {new Date(course.updated_at).toLocaleDateString()}</span></>}
        action={<Button asChild className="h-11 sm:h-10"><Link href={`/practice?course_id=${course.id}`}>Start practice</Link></Button>}
      />

      <nav aria-label={`${course.name} views`} className="mt-4 flex gap-1 overflow-x-auto border-b border-border pb-2">
        {courseLinks.map(({ label, href, icon: Icon }, index) => <Link key={label} href={href} aria-current={index === 0 ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9 ${index === 0 ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}><Icon className="h-4 w-4" />{label}</Link>)}
      </nav>

      <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <WorkspaceSurface>
          <WorkspaceSectionHeader title="Next assignments" description="The next actions in this course" action={<Link href={`/assignments?course_id=${course.id}`} className="text-xs font-medium text-primary hover:underline">View all</Link>} />
          {upcoming.length === 0 ? (
            <div className="px-5 py-10 text-center"><CalendarDays className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-medium">No upcoming assignments</p><p className="mt-1 text-xs text-muted-foreground">This course has no future deadlines in Smartlearn.</p></div>
          ) : upcoming.slice(0, 6).map((assignment) => {
            const due = parseISO(assignment.due_date as string);
            const urgent = due.getTime() - now.getTime() < 48 * 3_600_000;
            return <Link key={assignment.id} href={`/assignments?assignmentId=${encodeURIComponent(assignment.id)}`} className="group grid min-h-16 grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><span className={`grid h-10 w-10 place-items-center rounded-md text-center ${urgent ? "bg-warning/10 text-warning" : "bg-surface-2 text-muted-foreground"}`}><span><span className="block text-[8px] font-semibold uppercase">{format(due, "MMM")}</span><span className="block text-sm font-semibold leading-none">{format(due, "d")}</span></span></span><span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground">{assignment.title}</span><span className="mt-0.5 block text-xs capitalize text-muted-foreground">{assignment.assignment_type ?? "Assignment"} · {format(due, "p")}</span></span><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></Link>;
          })}
        </WorkspaceSurface>

        <WorkspaceSurface>
          <WorkspaceSectionHeader title="Course overview" />
          <dl className="divide-y divide-border px-4">
            <div className="flex items-center justify-between gap-4 py-3"><dt className="text-xs text-muted-foreground">Upcoming</dt><dd className="text-sm font-semibold tabular-nums">{upcoming.length}</dd></div>
            <div className="flex items-center justify-between gap-4 py-3"><dt className="text-xs text-muted-foreground">Completed</dt><dd className="text-sm font-semibold tabular-nums">{completedCount}</dd></div>
            <div className="flex items-center justify-between gap-4 py-3"><dt className="text-xs text-muted-foreground">Indexed materials</dt><dd className="text-sm font-semibold tabular-nums">{(notes ?? []).length}</dd></div>
            <div className="flex items-center justify-between gap-4 py-3"><dt className="text-xs text-muted-foreground">Current grade</dt><dd className="text-sm font-semibold tabular-nums">{gradePercent === null ? "Unavailable" : `${gradePercent}%`}</dd></div>
          </dl>
          {gradePercent === null ? <p className="border-t border-border px-4 py-3 text-xs leading-5 text-muted-foreground">Canvas has not provided enough graded points for a reliable current grade.</p> : null}
        </WorkspaceSurface>
      </div>

      <WorkspaceSurface className="mt-4">
        <WorkspaceSectionHeader title="Recent materials" description="Recently updated notes and imported content" action={<Link href={`/notes?course_id=${course.id}`} className="text-xs font-medium text-primary hover:underline">Open library</Link>} />
        {(notes ?? []).length === 0 ? <div className="px-5 py-8 text-center text-sm text-muted-foreground">No indexed materials for this course yet.</div> : ((notes ?? []) as NoteRow[]).slice(0, 5).map((note) => <Link key={note.id} href={`/notes?noteId=${encodeURIComponent(note.id)}`} className="group flex min-h-14 items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><FileText className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{note.title || note.file_name || "Untitled material"}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{note.unit_name || "Course material"} · Updated {new Date(note.updated_at).toLocaleDateString()}</span></span><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></Link>)}
      </WorkspaceSurface>
    </WorkspacePage>
  );
}
