import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/backend/supabase/server";
import { fetchCanvasModuleItems, fetchCanvasModules } from "@/backend/lms/canvas";
import { getCanvasCourseContext } from "@/backend/lms/canvasConnection";
import { buildGeneratedCourseUnits, type CourseUnitMaterial } from "@/backend/lms/courseUnits";
import { buildCanvasCourseUnits } from "@/backend/canvas-intelligence/moduleScope";

export const dynamic = "force-dynamic";

const courseIdSchema = z.string().uuid();

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsedCourseId = courseIdSchema.safeParse(new URL(req.url).searchParams.get("courseId"));
  if (!parsedCourseId.success) {
    return NextResponse.json({ error: "A valid courseId is required." }, { status: 400 });
  }
  const courseId = parsedCourseId.data;

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, platform")
    .eq("id", courseId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (courseError || !course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const warnings: string[] = [];
  const canvasContext = course.platform === "canvas"
    ? await getCanvasCourseContext(supabase, user.id, courseId)
    : null;

  if (canvasContext) {
    const canvasCourseId = Number(canvasContext.course.platform_id);
    if (Number.isFinite(canvasCourseId)) {
      try {
        const modules = await fetchCanvasModules(
          canvasContext.connection.canvas_domain,
          canvasContext.connection.access_token,
          canvasCourseId
        );

        if (modules.length > 0) {
          const itemResults = await Promise.all(
            modules.map(async (module) => {
              try {
                const items = await fetchCanvasModuleItems(
                  canvasContext.connection.canvas_domain,
                  canvasContext.connection.access_token,
                  canvasCourseId,
                  module.id
                );
                return { moduleId: module.id, items, failed: false };
              } catch (error) {
                const message = error instanceof Error ? error.message : "Canvas item request failed.";
                warnings.push(`${module.name}: ${message}`);
                return { moduleId: module.id, items: [], failed: true };
              }
            })
          );
          const itemsByModule = new Map(itemResults.map((result) => [result.moduleId, result]));
          const units = buildCanvasCourseUnits(modules.map((module) => ({
            module,
            items: itemsByModule.get(module.id)?.items ?? [],
          })));

          return NextResponse.json(
            { units, generated: false, warnings },
            { headers: { "Cache-Control": "private, no-store" } }
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Canvas modules request failed.";
        warnings.push(message);
      }
    } else {
      warnings.push("The stored Canvas course identifier is invalid.");
    }
  } else if (course.platform === "canvas") {
    warnings.push("The Canvas connection for this course could not be resolved.");
  }

  const [{ data: assignments, error: assignmentsError }, { data: notes, error: notesError }] = await Promise.all([
    supabase
      .from("assignments")
      .select("id, title, due_date")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(500),
    supabase
      .from("notes")
      .select("id, title, file_type, unit_name")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .order("updated_at", { ascending: true })
      .limit(500),
  ]);

  if (assignmentsError || notesError) {
    console.error("[course-units] Fallback material query failed", assignmentsError ?? notesError);
    return NextResponse.json({ error: "Course units could not be loaded." }, { status: 500 });
  }

  const materials: CourseUnitMaterial[] = [
    ...(assignments ?? []).map((assignment) => ({
      id: assignment.id,
      kind: "assignment" as const,
      title: assignment.title,
      dueAt: assignment.due_date,
    })),
    ...(notes ?? []).map((note) => ({
      id: note.id,
      kind: "note" as const,
      title: note.title,
      unitName: note.unit_name,
      fileType: note.file_type,
    })),
  ];

  return NextResponse.json(
    {
      units: buildGeneratedCourseUnits(materials),
      generated: true,
      warnings,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
