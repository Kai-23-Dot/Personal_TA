import Link from "next/link";
import { BookOpen, RefreshCw } from "lucide-react";
import { createClient } from "@/backend/supabase/server";
import { Button } from "@/frontend/components/ui/button";
import { EmptyState } from "@/frontend/components/ui/empty-state";
import { CourseDatabase, type CourseDatabaseRow } from "@/frontend/components/courses/course-database";
import { WorkspacePage, WorkspacePageHeader } from "@/frontend/components/workspace/workspace-primitives";

type CourseRow = {
  id: string;
  name: string;
  platform: string;
  teacher_name: string | null;
  section: string | null;
  color: string | null;
  is_active: boolean;
  academic_year: string | null;
  semester: string | null;
};
type AssignmentRow = { course_id: string; due_date: string | null; is_completed: boolean };
type NoteRow = { course_id: string | null };
type GradeRow = { course_id: string; points_earned: number | null; points_possible: number | null };

export default async function CoursesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user!.id;
  const [{ data: courses }, { data: assignments }, { data: notes }, { data: gradeEvents }, { data: canvasConnection }] = await Promise.all([
    supabase.from("courses").select("id, name, platform, teacher_name, section, color, is_active, academic_year, semester").eq("user_id", userId).order("is_active", { ascending: false }).order("name"),
    supabase.from("assignments").select("course_id, due_date, is_completed").eq("user_id", userId),
    supabase.from("notes").select("course_id").eq("user_id", userId),
    supabase.from("grade_events").select("course_id, points_earned, points_possible").eq("user_id", userId),
    supabase.from("lms_connections").select("id, last_synced_at").eq("user_id", userId).eq("platform", "canvas").eq("is_active", true).maybeSingle(),
  ]);

  const now = Date.now();
  const assignmentSummary = new Map<string, { upcoming: number; next: string | null }>();
  for (const assignment of (assignments ?? []) as AssignmentRow[]) {
    if (assignment.is_completed || !assignment.due_date || new Date(assignment.due_date).getTime() < now) continue;
    const current = assignmentSummary.get(assignment.course_id) ?? { upcoming: 0, next: null };
    current.upcoming += 1;
    if (!current.next || new Date(assignment.due_date) < new Date(current.next)) current.next = assignment.due_date;
    assignmentSummary.set(assignment.course_id, current);
  }
  const noteCounts = new Map<string, number>();
  for (const note of (notes ?? []) as NoteRow[]) if (note.course_id) noteCounts.set(note.course_id, (noteCounts.get(note.course_id) ?? 0) + 1);
  const gradeTotals = new Map<string, { earned: number; possible: number }>();
  for (const grade of (gradeEvents ?? []) as GradeRow[]) {
    if (grade.points_earned === null || grade.points_possible === null || grade.points_possible <= 0) continue;
    const total = gradeTotals.get(grade.course_id) ?? { earned: 0, possible: 0 };
    total.earned += Number(grade.points_earned);
    total.possible += Number(grade.points_possible);
    gradeTotals.set(grade.course_id, total);
  }

  const rows: CourseDatabaseRow[] = ((courses ?? []) as CourseRow[]).map((course) => {
    const assignment = assignmentSummary.get(course.id);
    const grade = gradeTotals.get(course.id);
    return {
      id: course.id,
      name: course.name,
      teacherName: course.teacher_name,
      section: course.section,
      term: [course.semester, course.academic_year].filter(Boolean).join(" · ") || "Current term",
      color: course.color,
      active: course.is_active,
      platform: course.platform,
      nextDeadline: assignment?.next ?? null,
      upcomingCount: assignment?.upcoming ?? 0,
      indexedCount: noteCounts.get(course.id) ?? 0,
      gradePercent: grade && grade.possible > 0 ? Math.round((grade.earned / grade.possible) * 1000) / 10 : null,
    };
  });

  return (
    <WorkspacePage wide>
      <WorkspacePageHeader
        icon={BookOpen}
        eyebrow="Learn"
        title="Courses"
        description="Current classes, materials, deadlines, and synced progress in one searchable view."
        action={<Button asChild variant="secondary" className="h-11 sm:h-10"><Link href="/settings/setup/canvas"><RefreshCw className="h-4 w-4" />{canvasConnection ? "Manage Canvas" : "Connect Canvas"}</Link></Button>}
        meta={canvasConnection?.last_synced_at ? <span>Canvas updated {new Date(canvasConnection.last_synced_at).toLocaleString()}</span> : undefined}
      />
      <div className="mt-5">
        {rows.length === 0 ? (
          <EmptyState icon={BookOpen} title={canvasConnection ? "No synced courses yet" : "Connect Canvas to import courses"} description={canvasConnection ? "Canvas is connected, but no active or archived courses were imported. Run a sync from Today." : "Connect your school’s Canvas account to build your course workspace."} action={<Button asChild><Link href={canvasConnection ? "/dashboard" : "/settings/setup/canvas"}>{canvasConnection ? "Open Today" : "Connect Canvas"}</Link></Button>} />
        ) : <CourseDatabase courses={rows} />}
      </div>
    </WorkspacePage>
  );
}
