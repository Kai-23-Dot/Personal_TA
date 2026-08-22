/**
 * LMS Sync Route — POST /api/sync
 *
 * Syncs courses, assignments, grades, and notes for a given LMS connection.
 * Returns { success, courses, assignments, notes, errors } so callers can
 * surface any DB or API problems to the user.
 */

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient, createServiceClient } from "@/backend/supabase/server";
import {
  fetchGCCourses,
  fetchGCCourseWork,
  parseDueDate,
  mapWorkType,
  refreshGoogleAccessToken,
} from "@/backend/lms/google-classroom";
import {
  fetchCanvasCourses,
  fetchCanvasAssignments,
  fetchCanvasCourseSubmissions,
  fetchCanvasPages,
  fetchCanvasPageBody,
  fetchCanvasPageDetail,
  fetchCanvasFiles,
  fetchCanvasFileById,
  fetchCanvasModules,
  fetchCanvasModuleItems,
  downloadCanvasFile,
  mapCanvasAssignmentType,
  htmlToPlainText,
} from "@/backend/lms/canvas";
import {
  fetchMSClasses,
  fetchMSAssignments,
  refreshMicrosoftAccessToken,
} from "@/backend/lms/microsoft-teams";
import {
  fetchICProfile,
  fetchICSections,
  fetchICAssignments,
  mapICAssignmentType,
} from "@/backend/lms/infinite-campus";
import { extractFileText, mimeToFileType } from "@/backend/utils/extractFileText";
import { crawlCanvasCourseContent } from "@/backend/canvas-intelligence/canvasCrawler";
import { extractFromGoogleLink, extractFromHtml } from "@/backend/canvas-intelligence/contentExtractor";
import { classifyContent } from "@/backend/canvas-intelligence/contentClassifier";
import { deactivateMissingCanvasCourses } from "@/backend/lms/deactivateMissingCanvasCourses";
import { getCanvasCourseLifecycle } from "@/backend/lms/courseLifecycle";

const CRON_SECRET = process.env.CRON_SECRET;
const syncRequestSchema = z.object({
  connectionId: z.string().uuid(),
  mode: z.enum(["full", "quick"]).optional(),
}).strict();

function validCronAuthorization(req: Request): boolean {
  if (!CRON_SECRET) return false;
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(CRON_SECRET);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function runCronSync(req: Request) {
  if (!validCronAuthorization(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The service client is created only after the cron secret is verified.
  const supabase = createServiceClient();
  const mode = new URL(req.url).searchParams.get("mode") === "quick" ? "quick" : "full";
  const { data: connections, error: connectionError } = await supabase
    .from("lms_connections")
    .select("*")
    .eq("is_active", true)
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(3);

  if (connectionError) {
    console.error("[sync/cron] Failed to load connections:", connectionError);
    return NextResponse.json({ error: "Failed to load LMS connections." }, { status: 500 });
  }

  let totalCourses = 0;
  let totalAssignments = 0;
  let totalNotes = 0;
  const errors: string[] = [];

  for (const conn of connections ?? []) {
    try {
      const result = await syncConnection(supabase, conn, mode);
      totalCourses += result.courses;
      totalAssignments += result.assignments;
      totalNotes += result.notes;
      errors.push(...result.errors.map((message) => `${conn.id}: ${message}`));
      if (result.errors.length === 0 || result.courses > 0 || result.assignments > 0 || result.notes > 0) {
        await supabase
          .from("lms_connections")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", conn.id);
      }
    } catch (error) {
      console.error(`[sync/cron] Connection ${conn.id} failed:`, error);
      errors.push(`${conn.id}: connection sync failed`);
    }
  }

  return NextResponse.json({
    success: errors.length === 0,
    partial: errors.length > 0,
    processedConnections: connections?.length ?? 0,
    courses: totalCourses,
    assignments: totalAssignments,
    notes: totalNotes,
    errors,
  });
}

export async function GET(req: Request) {
  return runCronSync(req);
}

export async function POST(req: Request) {
  const supabase = await createClient();

  // User-initiated sync
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsedBody = syncRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "A valid connectionId is required." }, { status: 400 });
  }
  const { connectionId, mode = "full" } = parsedBody.data;

  const { data: connection, error: connectionError } = await supabase
    .from("lms_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (connectionError || !connection) {
    return NextResponse.json({ success: false, error: "Connection not found" }, { status: 404 });
  }

  const result = await syncConnection(supabase, connection, mode);

  if (result.errors.length === 0 || result.courses > 0 || result.assignments > 0 || result.notes > 0) {
    await supabase
      .from("lms_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", connectionId)
      .eq("user_id", user.id);
  }

  return NextResponse.json({
    success: result.errors.length === 0,
    partial: result.errors.length > 0,
    ...result,
  });
}

type SyncResult = { courses: number; assignments: number; notes: number; errors: string[] };
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function getAssignmentCutoffIso(now = new Date()): string {
  return new Date(now.getTime() - ONE_YEAR_MS).toISOString();
}

function isOlderThanOneYear(dateIso: string | null | undefined, cutoffIso: string): boolean {
  return Boolean(dateIso && dateIso < cutoffIso);
}

async function syncConnection(
  supabase: SupabaseClient,
  connection: {
    id: string;
    user_id: string;
    platform: string;
    access_token: string;
    refresh_token: string | null;
    token_expires_at: string | null;
    canvas_domain: string | null;
  },
  mode: "full" | "quick" = "full"
): Promise<SyncResult> {
  let { access_token } = connection;
  const { user_id, platform, canvas_domain, refresh_token, token_expires_at } = connection;
  const googleApiKey = process.env.GOOGLE_DRIVE_API_KEY;
  let coursesSynced = 0;
  let assignmentsSynced = 0;
  let notesSynced = 0;
  const errors: string[] = [];
  const assignmentCutoffIso = getAssignmentCutoffIso();

  // Refresh OAuth tokens if expired
  if (refresh_token && token_expires_at) {
    const expired = new Date(token_expires_at).getTime() <= Date.now();
    if (expired && (platform === "google_classroom" || platform === "microsoft_teams")) {
      try {
        if (platform === "google_classroom") {
          const refreshed = await refreshGoogleAccessToken(refresh_token);
          access_token = refreshed.access_token;
          const expiresAt = refreshed.expires_in
            ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
            : null;
          await supabase
            .from("lms_connections")
            .update({ access_token, token_expires_at: expiresAt })
            .eq("id", connection.id);
        }
        if (platform === "microsoft_teams") {
          const refreshed = await refreshMicrosoftAccessToken(refresh_token);
          access_token = refreshed.access_token;
          const expiresAt = refreshed.expires_in
            ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
            : null;
          await supabase
            .from("lms_connections")
            .update({ access_token, token_expires_at: expiresAt })
            .eq("id", connection.id);
        }
      } catch (err) {
        errors.push(`${platform}: token refresh failed — ${(err as Error).message}`);
      }
    }
  }

  // ── Google Classroom ─────────────────────────────────────────────────────
  if (platform === "google_classroom") {
    let gcCourses;
    try {
      gcCourses = await fetchGCCourses(access_token);
    } catch (err) {
      errors.push(`Google Classroom: failed to fetch courses — ${(err as Error).message}`);
      return { courses: 0, assignments: 0, notes: 0, errors };
    }

    for (const gc of gcCourses) {
      const { data: course, error: courseErr } = await supabase
        .from("courses")
        .upsert(
          {
            user_id,
            connection_id: connection.id,
            platform: "google_classroom",
            platform_id: gc.id,
            name: gc.name,
            section: gc.section ?? null,
            description: gc.description ?? null,
            is_active: true,
          },
          { onConflict: "user_id,connection_id,platform_id" }
        )
        .select()
        .single();

      if (courseErr) { errors.push(`Course upsert failed (${gc.name}): ${courseErr.message}`); continue; }
      if (!course) continue;
      coursesSynced++;

      try {
        const courseWork = await fetchGCCourseWork(access_token, gc.id);
        for (const cw of courseWork) {
          const dueAt = parseDueDate(cw.dueDate, cw.dueTime);
          if (isOlderThanOneYear(dueAt, assignmentCutoffIso)) continue;

          const { error: aErr } = await supabase.from("assignments").upsert(
            {
              user_id,
              course_id: course.id,
              platform_id: cw.id,
              title: cw.title,
              description: cw.description ?? null,
              assignment_type: mapWorkType(cw.workType),
              due_date: dueAt,
              url: cw.alternateLink,
              points_possible: cw.maxPoints ?? null,
            },
            { onConflict: "user_id,course_id,platform_id" }
          );
          if (aErr) {
            errors.push(`Assignment upsert failed (${cw.title}): ${aErr.message}`);
            if (aErr.code === "42P10") {
              errors.push("DB migration needed — run supabase/migrations/004_canvas_sync_fix.sql in the Supabase SQL Editor");
              break;
            }
          } else {
            assignmentsSynced++;
          }
        }
      } catch (err) {
        errors.push(`Google Classroom course work fetch failed (${gc.name}): ${(err as Error).message}`);
      }
    }

  // ── Canvas ────────────────────────────────────────────────────────────────
  } else if (platform === "canvas" && canvas_domain) {
    let canvasCourses;
    try {
      canvasCourses = await fetchCanvasCourses(canvas_domain, access_token);
    } catch (err) {
      errors.push(`Canvas: failed to fetch courses — ${(err as Error).message}`);
      return { courses: 0, assignments: 0, notes: 0, errors };
    }

    // Canvas sometimes keeps concluded enrollments in its active collection.
    // Only lifecycle-current IDs remain visible in Smartlearn.
    const courseLifecycles = new Map(
      canvasCourses.map((course) => [course.id, getCanvasCourseLifecycle(course)])
    );
    const activePlatformIds = canvasCourses
      .filter((course) => courseLifecycles.get(course.id)?.isActive)
      .map((course) => String(course.id));

    for (const cc of canvasCourses) {
      const teacher = cc.teachers?.[0];
      const lifecycle = courseLifecycles.get(cc.id) ?? getCanvasCourseLifecycle(cc);
      const { data: course, error: courseErr } = await supabase
        .from("courses")
        .upsert(
          {
            user_id,
            connection_id: connection.id,
            platform: "canvas",
            platform_id: String(cc.id),
            name: cc.name,
            teacher_name: teacher?.display_name ?? null,
            teacher_email: teacher?.login_id ?? null,
            is_active: lifecycle.isActive,
            academic_year: lifecycle.academicYear,
            semester: lifecycle.semester,
          },
          { onConflict: "user_id,connection_id,platform_id" }
        )
        .select()
        .single();

      if (courseErr) { errors.push(`Canvas course upsert failed (${cc.name}): ${courseErr.message}`); continue; }
      if (!course) continue;
      if (!lifecycle.isActive) continue;
      coursesSynced++;

      // Assignment sync
      const assignmentIdMap: Record<string, string> = {};
      const assignmentPointsMap: Record<string, number | null> = {};
      let assignmentConstraintMissing = false;

      try {
        const assignments = await fetchCanvasAssignments(canvas_domain, access_token, cc.id);
        for (const a of assignments) {
          if (isOlderThanOneYear(a.due_at, assignmentCutoffIso)) continue;

          const { data: aRow, error: aErr } = await supabase
            .from("assignments")
            .upsert(
              {
                user_id,
                course_id: course.id,
                platform_id: String(a.id),
                title: a.name,
                description: a.description ?? null,
                assignment_type: mapCanvasAssignmentType(a.submission_types, a.name),
                due_date: a.due_at ?? null,
                url: a.html_url,
                points_possible: a.points_possible ?? null,
              },
              { onConflict: "user_id,course_id,platform_id" }
            )
            .select("id, platform_id")
            .single();

          if (aErr) {
            if (aErr.code === "42P10") {
              assignmentConstraintMissing = true;
              errors.push("DB migration needed — paste supabase/migrations/004_canvas_sync_fix.sql into the Supabase SQL Editor and run it, then sync again");
              break;
            }
            errors.push(`Assignment upsert failed (${a.name}): ${aErr.message}`);
          } else if (aRow) {
            assignmentIdMap[aRow.platform_id] = aRow.id;
            assignmentPointsMap[aRow.platform_id] = a.points_possible ?? null;
            assignmentsSynced++;
          }
        }
      } catch (err) {
        errors.push(`Canvas assignment fetch failed (${cc.name}): ${(err as Error).message}`);
      }

      // Submission & grade sync — skip if assignments failed due to missing constraint
      if (!assignmentConstraintMissing) {
        try {
          const submissions = await fetchCanvasCourseSubmissions(canvas_domain, access_token, cc.id);
          for (const sub of submissions) {
            const assignmentId = assignmentIdMap[String(sub.assignment_id)];
            if (!assignmentId) continue;

            // Determine if the student has submitted this assignment
            const isSubmitted =
              sub.submitted_at != null ||
              sub.workflow_state === "submitted" ||
              sub.workflow_state === "graded" ||
              sub.workflow_state === "pending_review";

            // Mark the assignment as completed whenever Canvas shows it as submitted
            if (isSubmitted) {
              await supabase
                .from("assignments")
                .update({
                  is_completed: true,
                  completed_at: sub.submitted_at ?? new Date().toISOString(),
                })
                .eq("id", assignmentId)
                .eq("user_id", user_id);
            }

            // Only record a submission row + grade event when there's an actual score
            if (sub.score == null || !sub.submitted_at) continue;

            const pointsPossible = assignmentPointsMap[String(sub.assignment_id)];

            const { data: subRow, error: subErr } = await supabase
              .from("submissions")
              .upsert(
                {
                  user_id,
                  assignment_id: assignmentId,
                  platform_id: String(sub.assignment_id),
                  submitted_at: sub.submitted_at,
                  points_earned: sub.score,
                  grade: sub.grade,
                  is_late: sub.late ?? false,
                },
                { onConflict: "user_id,assignment_id" }
              )
              .select("id")
              .single();

            if (subErr) {
              if (subErr.code === "42P10") {
                errors.push("Submissions unique index missing — run migration 003 in Supabase SQL Editor");
                break;
              }
              errors.push(`Submission upsert failed: ${subErr.message}`);
              continue;
            }

            if (subRow) {
              const { error: geErr } = await supabase.from("grade_events").upsert(
                {
                  user_id,
                  course_id: course.id,
                  submission_id: subRow.id,
                  event_type: "grade_received",
                  points_earned: sub.score,
                  points_possible: pointsPossible,
                  occurred_at: sub.submitted_at,
                  notes: `Canvas grade: ${sub.grade ?? String(sub.score)}`,
                },
                { onConflict: "submission_id" }
              );
              if (geErr && geErr.code === "42P10") {
                errors.push("Grade events unique index missing — run migration 003 in Supabase SQL Editor");
              }
            }
          }
        } catch (err) {
          errors.push(`Canvas grade fetch failed (${cc.name}): ${(err as Error).message}`);
        }
      }

      if (mode === "full") {
      // Canvas Pages → Notes
      try {
        const pages = await fetchCanvasPages(canvas_domain, access_token, cc.id);
        for (const page of pages) {
          const sourceFileId = `canvas_page_${cc.id}_${page.page_id}`;
          const content = await fetchCanvasPageBody(canvas_domain, access_token, cc.id, page.url);

          const { error: noteErr } = await supabase.from("notes").upsert(
            {
              user_id,
              course_id: course.id,
              title: page.title,
              content: content ?? null,
              source_type: "canvas",
              source_file_id: sourceFileId,
              source_url: `https://${canvas_domain}/courses/${cc.id}/pages/${page.url}`,
              file_type: "other",
              is_processed: false,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,source_file_id" }
          );
          if (noteErr) {
            if (noteErr.code === "42P10") {
              errors.push("Notes unique index missing — run migration 003 in Supabase SQL Editor");
              break;
            }
            // source_type constraint violation means migration 003 not run
            if (noteErr.code === "23514") {
              errors.push("Notes source_type constraint needs updating — run migration 003 in Supabase SQL Editor");
              break;
            }
          } else {
            notesSynced++;
          }
        }
      } catch (err) {
        errors.push(`Canvas pages fetch failed (${cc.name}): ${(err as Error).message}`);
      }

      // Canvas Files → Notes (PDF / DOCX / PPTX / TXT)
      try {
        const FILES_SIZE_CAP = 5 * 1024 * 1024; // 5 MB
        const files = await fetchCanvasFiles(canvas_domain, access_token, cc.id, 20);
        for (const file of files) {
          const fileType = mimeToFileType(file["content-type"] ?? file.content_type ?? "");
          if (!fileType) continue;
          if (file.size > FILES_SIZE_CAP) continue;

          const sourceFileId = `canvas_file_${cc.id}_${file.id}`;

          // Download file — Canvas URL may redirect to S3; follow redirects with auth
          let fileBuffer: Buffer;
          try {
            ({ buffer: fileBuffer } = await downloadCanvasFile(
              canvas_domain,
              access_token,
              file.url,
              FILES_SIZE_CAP
            ));
          } catch {
            continue;
          }

          const content = await extractFileText(fileBuffer, fileType);

          // Map extracted type → notes.file_type CHECK values
          // CHECK allows: 'pdf','docx','txt','md','image','other'
          const noteFileType: string =
            fileType === "pdf" ? "pdf"
            : fileType === "docx" ? "docx"
            : fileType === "txt" ? "txt"
            : "other"; // pptx → 'other'

          const { error: noteErr } = await supabase.from("notes").upsert(
            {
              user_id,
              course_id: course.id,
              title: file.display_name,
              content: content ?? null,
              source_type: "canvas",
              source_file_id: sourceFileId,
              source_url: file.url,
              file_type: noteFileType,
              is_processed: false,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,source_file_id" }
          );
          if (noteErr) {
            if (noteErr.code === "42P10") {
              errors.push("Notes unique index missing — run migration 003 in Supabase SQL Editor");
              break;
            }
            if (noteErr.code === "23514") {
              errors.push("Notes source_type constraint needs updating — run migration 003 in Supabase SQL Editor");
              break;
            }
            errors.push(`File note upsert failed (${file.display_name}): ${noteErr.message}`);
          } else {
            notesSynced++;
          }
        }
      } catch (err) {
        errors.push(`Canvas files sync failed (${cc.name}): ${(err as Error).message}`);
      }

      // Canvas Modules → Notes
      // Traverses every module in the course and syncs Page and File items so
      // that practice sessions have access to ALL course content, not just what
      // the flat pages/files endpoints return.
      try {
        const modules = await fetchCanvasModules(canvas_domain, access_token, cc.id);
        for (const mod of modules) {
          const items = await fetchCanvasModuleItems(canvas_domain, access_token, cc.id, mod.id);
          for (const item of items) {

            // ── Page item ────────────────────────────────────────────────────
            if (item.type === "Page" && item.page_url) {
              const detail = await fetchCanvasPageDetail(canvas_domain, access_token, cc.id, item.page_url);
              if (!detail?.body) continue;
              const pageText = htmlToPlainText(detail.body);
              if (!pageText) continue;

              // Use the same source_file_id as the flat pages sync so upsert
              // avoids duplicates while also catching pages missed by /pages.
              const sourceFileId = `canvas_page_${cc.id}_${detail.page_id}`;
              const { error: noteErr } = await supabase.from("notes").upsert(
                {
                  user_id,
                  course_id: course.id,
                  title: detail.title,
                  content: pageText,
                  source_type: "canvas",
                  source_file_id: sourceFileId,
                  source_url: `https://${canvas_domain}/courses/${cc.id}/pages/${detail.url}`,
                  file_type: "other",
                  is_processed: false,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id,source_file_id" }
              );
              if (noteErr?.code === "42P10") {
                errors.push("Notes unique index missing — run migration 003 in Supabase SQL Editor");
                break;
              }
              if (!noteErr) notesSynced++;
            }

            // ── File item ────────────────────────────────────────────────────
            else if (item.type === "File" && item.content_id) {
              const sourceFileId = `canvas_file_${cc.id}_${item.content_id}`;

              // Skip files already synced with content to avoid re-downloading
              const { count: existing } = await supabase
                .from("notes")
                .select("id", { count: "exact", head: true })
                .eq("user_id", user_id)
                .eq("source_file_id", sourceFileId)
                .not("content", "is", null);
              if ((existing ?? 0) > 0) continue;

              const fileMeta = await fetchCanvasFileById(canvas_domain, access_token, cc.id, item.content_id);
              const dlUrl = item.content_details?.url ?? fileMeta?.url;
              const contentType =
                item.content_details?.["content-type"] ??
                fileMeta?.["content-type"] ??
                fileMeta?.content_type;
              const fileSize = item.content_details?.size ?? fileMeta?.size ?? 0;
              if (!dlUrl || !contentType) continue;

              const fileType = mimeToFileType(contentType);
              if (!fileType) continue;
              if (fileSize > 5 * 1024 * 1024) continue; // 5 MB cap

              let fileBuffer: Buffer;
              try {
                ({ buffer: fileBuffer } = await downloadCanvasFile(
                  canvas_domain,
                  access_token,
                  dlUrl,
                  5 * 1024 * 1024
                ));
              } catch {
                continue;
              }

              const content = await extractFileText(fileBuffer, fileType);
              const noteFileType =
                fileType === "pdf" ? "pdf"
                : fileType === "docx" ? "docx"
                : fileType === "txt" ? "txt"
                : "other";

              const { error: noteErr } = await supabase.from("notes").upsert(
                {
                  user_id,
                  course_id: course.id,
                  title: fileMeta?.display_name ?? item.title,
                  content: content ?? null,
                  source_type: "canvas",
                  source_file_id: sourceFileId,
                  source_url: item.html_url ?? fileMeta?.url ?? null,
                  file_type: noteFileType,
                  is_processed: false,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id,source_file_id" }
              );
              if (noteErr?.code === "42P10") {
                errors.push("Notes unique index missing — run migration 003 in Supabase SQL Editor");
                break;
              }
              if (!noteErr) notesSynced++;
            }
          }
        }
      } catch (err) {
        errors.push(`Canvas modules sync failed (${cc.name}): ${(err as Error).message}`);
      }

      // Canvas Content Intelligence crawl (syllabus/discussions/quizzes/external/module graph)
      try {
        const { data: googleConn } = await supabase
          .from("lms_connections")
          .select("access_token")
          .eq("user_id", user_id)
          .eq("platform", "google_classroom")
          .eq("is_active", true)
          .maybeSingle();

        const crawled = await crawlCanvasCourseContent({
          domain: canvas_domain,
          accessToken: access_token,
          canvasCourseId: cc.id,
          localCourseId: course.id,
        });

        for (const item of crawled) {
          if (!item.title) continue;
          const sourceFileId = `canvas_intel_${cc.id}_${item.type}_${item.id}`;
          const raw = item.bodyHtml ?? item.textContent ?? "";
          const googleUrl = [item.externalUrl, item.sourceUrl, item.url].find((url) => url && /docs\.google\.com|drive\.google\.com/.test(url));
          let extracted = item.bodyHtml ? await extractFromHtml(item.bodyHtml) : raw.trim();
          if (googleUrl && (!extracted || extracted === googleUrl || item.extractionStatus === "pending" || item.extractionStatus === "metadata_only")) {
            const googleText = await extractFromGoogleLink({
              url: googleUrl,
              googleApiKey,
              oauthAccessToken: googleConn?.access_token ?? null,
            });
            if (googleText) extracted = googleText;
          }
          if (!extracted) continue;

          const classified = classifyContent(item, extracted);
          const tagText = classified.tags.length ? `\n\nTags: ${classified.tags.join(", ")}` : "";
          const metaText = item.moduleName ? `\nModule: ${item.moduleName}` : "";

          const { error: noteErr } = await supabase.from("notes").upsert(
            {
              user_id,
              course_id: course.id,
              title: item.title,
              content: `${extracted}${metaText}${tagText}`.slice(0, 30000),
              source_type: "canvas",
              source_file_id: sourceFileId,
              source_url: item.sourceUrl ?? item.externalUrl ?? null,
              file_type: "other",
              topic_tags: classified.tags,
              is_processed: false,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,source_file_id" }
          );

          if (!noteErr) notesSynced++;
        }
      } catch (err) {
        errors.push(`Canvas intelligence crawl failed (${cc.name}): ${(err as Error).message}`);
      }
      }
    }

    // Deactivate courses that were removed from Canvas since the last sync
    const deactivateErr = await deactivateMissingCanvasCourses(supabase, {
      userId: user_id,
      connectionId: connection.id,
      activePlatformIds,
    });
    if (deactivateErr) {
      errors.push(`Failed to deactivate removed Canvas courses: ${deactivateErr.message}`);
    }

  // ── Infinite Campus ───────────────────────────────────────────────────────
  } else if (platform === "infinite_campus" && canvas_domain) {
    // canvas_domain column is reused to store the IC district domain
    const icDomain = canvas_domain;

    // Fetch student profile to get personID
    const profile = await fetchICProfile(icDomain, access_token);
    if (!profile) {
      errors.push("Infinite Campus: could not fetch student profile — check your token");
      return { courses: 0, assignments: 0, notes: 0, errors };
    }
    const studentId = profile.personID;

    // Fetch sections (courses)
    let sections;
    try {
      sections = await fetchICSections(icDomain, access_token, studentId);
    } catch (err) {
      errors.push(`Infinite Campus: failed to fetch sections — ${(err as Error).message}`);
      return { courses: 0, assignments: 0, notes: 0, errors };
    }

    for (const section of sections) {
      const courseName = section.courseName ?? section.displayName ?? section.name ?? "Unknown Course";

      const { data: course, error: courseErr } = await supabase
        .from("courses")
        .upsert(
          {
            user_id,
            connection_id: connection.id,
            platform: "infinite_campus",
            platform_id: String(section.sectionID),
            name: courseName,
            teacher_name: section.teacherDisplay ?? null,
            teacher_email: section.teacherEmail ?? null,
            is_active: true,
          },
          { onConflict: "user_id,connection_id,platform_id" }
        )
        .select()
        .single();

      if (courseErr) { errors.push(`IC course upsert failed (${courseName}): ${courseErr.message}`); continue; }
      if (!course) continue;
      coursesSynced++;

      // Assignment sync (no grades — IC grade access not available)
      try {
        const assignments = await fetchICAssignments(icDomain, access_token, studentId, section.sectionID);
        for (const a of assignments) {
          if (isOlderThanOneYear(a.dueDate, assignmentCutoffIso)) continue;
          const { error: aErr } = await supabase
            .from("assignments")
            .upsert(
              {
                user_id,
                course_id: course.id,
                platform_id: String(a.assignmentID),
                title: a.assignmentName,
                assignment_type: mapICAssignmentType(a.type),
                due_date: a.dueDate ?? null,
                points_possible: a.totalPoints ?? null,
                url: a.url ?? null,
              },
              { onConflict: "user_id,course_id,platform_id" }
            );

          if (aErr) {
            if (aErr.code === "42P10") {
              errors.push("DB migration needed — run supabase/migrations/005_fix_partial_indexes.sql");
              break;
            }
            errors.push(`IC assignment upsert failed (${a.assignmentName}): ${aErr.message}`);
          } else {
            assignmentsSynced++;
          }
        }
      } catch (err) {
        errors.push(`IC assignment fetch failed (${courseName}): ${(err as Error).message}`);
      }
    }

  // ── Microsoft Teams ───────────────────────────────────────────────────────
  } else if (platform === "microsoft_teams") {
    let classes;
    try {
      classes = await fetchMSClasses(access_token);
    } catch (err) {
      errors.push(`Microsoft Teams: failed to fetch classes — ${(err as Error).message}`);
      return { courses: 0, assignments: 0, notes: 0, errors };
    }

    for (const cls of classes) {
      const { data: course, error: courseErr } = await supabase
        .from("courses")
        .upsert(
          {
            user_id,
            connection_id: connection.id,
            platform: "microsoft_teams",
            platform_id: cls.id,
            name: cls.displayName,
            description: cls.description ?? null,
            is_active: true,
          },
          { onConflict: "user_id,connection_id,platform_id" }
        )
        .select()
        .single();

      if (courseErr) { errors.push(`Teams class upsert failed (${cls.displayName}): ${courseErr.message}`); continue; }
      if (!course) continue;
      coursesSynced++;

      try {
        const assignments = await fetchMSAssignments(access_token, cls.id);
        for (const a of assignments) {
          if (isOlderThanOneYear(a.dueDateTime, assignmentCutoffIso)) continue;
          const { error: aErr } = await supabase.from("assignments").upsert(
            {
              user_id,
              course_id: course.id,
              platform_id: a.id,
              title: a.displayName,
              description: a.instructions?.content ?? null,
              assignment_type: "homework",
              due_date: a.dueDateTime ?? null,
              points_possible: a.grading?.maxPoints ?? null,
            },
            { onConflict: "user_id,course_id,platform_id" }
          );
          if (aErr) {
            if (aErr.code === "42P10") {
              errors.push("DB migration needed — run supabase/migrations/004_canvas_sync_fix.sql in Supabase SQL Editor");
              break;
            }
            errors.push(`MS assignment upsert failed (${a.displayName}): ${aErr.message}`);
          } else {
            assignmentsSynced++;
          }
        }
      } catch (err) {
        errors.push(`Microsoft Teams assignment fetch failed (${cls.displayName}): ${(err as Error).message}`);
      }
    }
  }

  return { courses: coursesSynced, assignments: assignmentsSynced, notes: notesSynced, errors };
}
