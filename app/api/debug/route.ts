/**
 * GET /api/debug
 *
 * Development-only endpoint. Returns DB row counts per table and
 * tests the Canvas API directly so we can see exactly what's failing.
 * Remove this file before going to production.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/backend/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── DB counts ────────────────────────────────────────────────────────────
  const [
    { count: courseCount },
    { count: assignmentCount },
    { count: submissionCount },
    { count: gradeEventCount },
    { count: noteCount },
    { data: connections },
  ] = await Promise.all([
    supabase.from("courses").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("assignments").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("submissions").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("grade_events").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("notes").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("lms_connections").select("id, platform, canvas_domain, last_synced_at, scopes").eq("user_id", user.id),
  ]);

  // ── Canvas live test ─────────────────────────────────────────────────────
  const canvasConn = (connections ?? []).find((c) => c.platform === "canvas");
  let canvasTest: Record<string, unknown> = { skipped: "no canvas connection" };

  if (canvasConn) {
    const { data: fullConn } = await supabase
      .from("lms_connections")
      .select("access_token, canvas_domain")
      .eq("id", canvasConn.id)
      .single();

    if (fullConn?.canvas_domain && fullConn?.access_token) {
      const domain = fullConn.canvas_domain;
      const token = fullConn.access_token;

      // Test 1: profile
      let profileStatus = 0;
      try {
        const r = await fetch(`https://${domain}/api/v1/users/self/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        profileStatus = r.status;
      } catch (e) {
        profileStatus = -1;
      }

      // Test 2: courses
      let coursesStatus = 0;
      let coursesCount = 0;
      let firstCourseId: number | null = null;
      try {
        const r = await fetch(`https://${domain}/api/v1/courses?enrollment_state=active&per_page=5`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        coursesStatus = r.status;
        if (r.ok) {
          const data = await r.json();
          coursesCount = data.length;
          firstCourseId = data[0]?.id ?? null;
        }
      } catch {
        coursesStatus = -1;
      }

      // Test 3: assignments for first course
      let assignmentsStatus = 0;
      let assignmentsCount = 0;
      if (firstCourseId) {
        try {
          const r = await fetch(`https://${domain}/api/v1/courses/${firstCourseId}/assignments?per_page=10`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          assignmentsStatus = r.status;
          if (r.ok) {
            const data = await r.json();
            assignmentsCount = data.length;
          }
        } catch {
          assignmentsStatus = -1;
        }
      }

      // Test 4: submissions for first course
      let submissionsStatus = 0;
      let submissionsCount = 0;
      if (firstCourseId) {
        try {
          const r = await fetch(
            `https://${domain}/api/v1/courses/${firstCourseId}/students/submissions?student_ids[]=self&per_page=10`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          submissionsStatus = r.status;
          if (r.ok) {
            const data = await r.json();
            submissionsCount = data.length;
          }
        } catch {
          submissionsStatus = -1;
        }
      }

      // Test 5: check unique indexes exist
      canvasTest = {
        domain,
        profileStatus,
        coursesStatus,
        coursesCount,
        firstCourseId,
        assignmentsStatus,
        assignmentsCount,
        submissionsStatus,
        submissionsCount,
        lastSynced: canvasConn.last_synced_at,
      };
    }
  }

  return NextResponse.json({
    db: {
      courses: courseCount,
      assignments: assignmentCount,
      submissions: submissionCount,
      grade_events: gradeEventCount,
      notes: noteCount,
    },
    connections: connections?.map((c) => ({
      platform: c.platform,
      last_synced_at: c.last_synced_at,
    })),
    canvas: canvasTest,
  });
}
