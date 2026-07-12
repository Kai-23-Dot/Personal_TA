/**
 * POST /api/sync/grades → fast grades-only Canvas sync.
 *
 * The full /api/sync pipeline re-fetches courses, assignments, pages, and
 * files — seconds of Canvas round trips. Opening the Grades tab only needs
 * fresh submissions, so this route:
 *   1. reuses the course + assignment rows already in the DB (no re-fetch),
 *   2. pulls submissions for every Canvas course IN PARALLEL,
 *   3. writes everything back in three BULK statements (completions,
 *      submissions, grade events) instead of per-row round trips,
 *      using the same conflict keys as the full sync (safe to run alongside).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";
import { fetchCanvasCourseSubmissions } from "@/backend/lms/canvas";

export const maxDuration = 30;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startedAt = Date.now();

  const { data: connections } = await supabase
    .from("lms_connections")
    .select("id, access_token, canvas_domain")
    .eq("user_id", user.id)
    .eq("platform", "canvas")
    .eq("is_active", true);

  if (!connections || connections.length === 0) {
    return NextResponse.json({ success: true, gradesSynced: 0, tookMs: 0 });
  }

  const connectionIds = connections.map((c) => c.id);
  const connectionById = new Map(connections.map((c) => [c.id, c]));

  // Courses + assignments come from the DB — the full sync owns keeping them fresh.
  const { data: courses } = await supabase
    .from("courses")
    .select("id, platform_id, connection_id")
    .eq("user_id", user.id)
    .eq("platform", "canvas")
    .eq("is_active", true)
    .in("connection_id", connectionIds);

  if (!courses || courses.length === 0) {
    return NextResponse.json({ success: true, gradesSynced: 0, tookMs: Date.now() - startedAt });
  }

  const { data: assignments } = await supabase
    .from("assignments")
    .select("id, course_id, platform_id, points_possible, is_completed")
    .eq("user_id", user.id)
    .in("course_id", courses.map((c) => c.id));

  const assignmentsByCourse = new Map<string, NonNullable<typeof assignments>>();
  (assignments ?? []).forEach((a) => {
    const list = assignmentsByCourse.get(a.course_id) ?? [];
    list.push(a);
    assignmentsByCourse.set(a.course_id, list);
  });

  // ── 1. Fetch all courses' submissions from Canvas in parallel ──
  const errors: string[] = [];
  const completionIds: string[] = [];
  type PendingGrade = {
    assignmentId: string;
    courseId: string;
    platformId: string;
    submittedAt: string;
    score: number;
    grade: string | null;
    late: boolean;
    pointsPossible: number | null;
  };
  const pending: PendingGrade[] = [];

  await Promise.all(
    courses.map(async (course) => {
      const conn = connectionById.get(course.connection_id);
      if (!conn?.canvas_domain || !course.platform_id) return;

      let submissions;
      try {
        submissions = await fetchCanvasCourseSubmissions(
          conn.canvas_domain,
          conn.access_token,
          Number(course.platform_id)
        );
      } catch (err) {
        errors.push(`Grade fetch failed: ${(err as Error).message}`);
        return;
      }

      const byPlatformId = new Map(
        (assignmentsByCourse.get(course.id) ?? []).map((a) => [a.platform_id, a])
      );

      for (const sub of submissions) {
        const assignment = byPlatformId.get(String(sub.assignment_id));
        if (!assignment) continue;

        const isSubmitted =
          sub.submitted_at != null ||
          sub.workflow_state === "submitted" ||
          sub.workflow_state === "graded" ||
          sub.workflow_state === "pending_review";

        if (isSubmitted && !assignment.is_completed) completionIds.push(assignment.id);
        if (sub.score == null || !sub.submitted_at) continue;

        pending.push({
          assignmentId: assignment.id,
          courseId: course.id,
          platformId: String(sub.assignment_id),
          submittedAt: sub.submitted_at,
          score: sub.score,
          grade: sub.grade ?? null,
          late: sub.late ?? false,
          pointsPossible: assignment.points_possible,
        });
      }
    })
  );

  // ── 2. Three bulk writes (Canvas returns one submission per assignment,
  //       so conflict keys are unique within each batch) ──
  if (completionIds.length > 0) {
    const { error } = await supabase
      .from("assignments")
      .update({ is_completed: true, completed_at: new Date().toISOString() })
      .in("id", completionIds)
      .eq("user_id", user.id);
    if (error) errors.push(`Completion update failed: ${error.message}`);
  }

  let gradesSynced = 0;
  if (pending.length > 0) {
    const { data: subRows, error: subErr } = await supabase
      .from("submissions")
      .upsert(
        pending.map((p) => ({
          user_id: user.id,
          assignment_id: p.assignmentId,
          platform_id: p.platformId,
          submitted_at: p.submittedAt,
          points_earned: p.score,
          grade: p.grade,
          is_late: p.late,
        })),
        { onConflict: "user_id,assignment_id" }
      )
      .select("id, assignment_id");

    if (subErr || !subRows) {
      errors.push(`Submission upsert failed: ${subErr?.message ?? "unknown"}`);
    } else {
      const subIdByAssignment = new Map(subRows.map((r) => [r.assignment_id, r.id]));
      const events = pending.flatMap((p) => {
        const submissionId = subIdByAssignment.get(p.assignmentId);
        if (!submissionId) return [];
        return [{
          user_id: user.id,
          course_id: p.courseId,
          submission_id: submissionId,
          event_type: "grade_received",
          points_earned: p.score,
          points_possible: p.pointsPossible,
          occurred_at: p.submittedAt,
          notes: `Canvas grade: ${p.grade ?? String(p.score)}`,
        }];
      });

      if (events.length > 0) {
        const { error: geErr } = await supabase
          .from("grade_events")
          .upsert(events, { onConflict: "submission_id" });
        if (geErr) errors.push(`Grade event upsert failed: ${geErr.message}`);
        else gradesSynced = events.length;
      }
    }
  }

  return NextResponse.json({
    success: true,
    gradesSynced,
    tookMs: Date.now() - startedAt,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
