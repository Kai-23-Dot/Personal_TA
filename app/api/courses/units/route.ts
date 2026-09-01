import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/backend/supabase/server";
import {
  fetchCanvasFilesWide,
  fetchCanvasFrontPage,
  fetchCanvasModuleItems,
  fetchCanvasModules,
  fetchCanvasPages,
  downloadCanvasFile,
} from "@/backend/lms/canvas";
import { getCanvasCourseContext } from "@/backend/lms/canvasConnection";
import { buildGeneratedCourseUnits, type CourseUnitMaterial } from "@/backend/lms/courseUnits";
import { buildCanvasCourseUnits } from "@/backend/canvas-intelligence/moduleScope";
import {
  buildCanvasHomepageUnits,
  countCanvasHomepageImagePageLinks,
  extractCanvasHomepageImageTiles,
} from "@/backend/canvas-intelligence/homepageUnits";
import {
  extractUnitLabelsFromImages,
  type ImageMediaType,
} from "@/backend/ai/ocrImage";
import { runWithUsageContext } from "@/backend/billing/usageContext";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const courseIdSchema = z.string().uuid();
const MAX_VISION_UNIT_TILES = 12;
const VISION_CACHE_TTL_MS = 30 * 60 * 1000;
const UNIT_IMAGE_TYPES: Record<string, ImageMediaType> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};
const homepageVisionCache = new Map<
  string,
  { expiresAt: number; labels: Map<string, string> }
>();

async function discoverVisionTileLabels(params: {
  userId: string;
  cacheKey: string;
  domain: string;
  accessToken: string;
  tiles: ReturnType<typeof extractCanvasHomepageImageTiles>;
}): Promise<Map<string, string>> {
  const cached = homepageVisionCache.get(params.cacheKey);
  if (cached && cached.expiresAt > Date.now()) return new Map(cached.labels);

  const downloads = (
    await Promise.allSettled(
      params.tiles.slice(0, MAX_VISION_UNIT_TILES).map(async (tile) => {
        const downloaded = await downloadCanvasFile(
          params.domain,
          params.accessToken,
          tile.url,
          5 * 1024 * 1024
        );
        const mediaType = UNIT_IMAGE_TYPES[downloaded.contentType];
        return mediaType
          ? { tile, buffer: downloaded.buffer, mediaType }
          : null;
      })
    )
  ).flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : []
  );
  if (downloads.length === 0) return new Map();

  const results = await runWithUsageContext(params.userId, () =>
    extractUnitLabelsFromImages(
      downloads.map(({ tile, buffer, mediaType }) => ({
        buffer,
        mediaType,
        label: tile.alt || tile.pageSlug,
      }))
    )
  );
  const labels = new Map<string, string>();
  for (const result of results) {
    const download = downloads[result.index];
    if (download && result.extractedText.trim()) {
      labels.set(download.tile.pageSlug, result.extractedText.trim());
    }
  }

  if (homepageVisionCache.size >= 100) {
    const oldestKey = homepageVisionCache.keys().next().value;
    if (oldestKey) homepageVisionCache.delete(oldestKey);
  }
  homepageVisionCache.set(params.cacheKey, {
    expiresAt: Date.now() + VISION_CACHE_TTL_MS,
    labels: new Map(labels),
  });
  return labels;
}

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
      const { canvas_domain: domain, access_token: accessToken } =
        canvasContext.connection;
      const [modules, frontPage, pages] = await Promise.all([
        fetchCanvasModules(domain, accessToken, canvasCourseId).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Canvas modules request failed.";
          warnings.push(`Modules: ${message}`);
          return [];
        }),
        fetchCanvasFrontPage(domain, accessToken, canvasCourseId),
        fetchCanvasPages(domain, accessToken, canvasCourseId).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Canvas pages request failed.";
          warnings.push(`Pages: ${message}`);
          return [];
        }),
      ]);

      let homepageUnits = frontPage?.body
        ? buildCanvasHomepageUnits({
            html: frontPage.body,
            courseId: canvasCourseId,
            domain,
            pages,
          })
        : [];
      let homepageFiles: Awaited<ReturnType<typeof fetchCanvasFilesWide>> = [];

      // Most image-tile homepages expose meaningful destination page titles.
      // If they do not, use Canvas file names as a cheap deterministic fallback
      // before considering the date-based generated structure.
      if (
        frontPage?.body &&
        homepageUnits.length < countCanvasHomepageImagePageLinks({
          html: frontPage.body,
          courseId: canvasCourseId,
          domain,
        })
      ) {
        homepageFiles = await fetchCanvasFilesWide(
          domain,
          accessToken,
          canvasCourseId,
          200
        ).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Canvas files request failed.";
          warnings.push(`Files: ${message}`);
          return [];
        });
        homepageUnits = buildCanvasHomepageUnits({
          html: frontPage.body,
          courseId: canvasCourseId,
          domain,
          pages,
          files: homepageFiles,
        });
      }

      if (frontPage?.body) {
        const detectedPageSlugs = new Set(
          homepageUnits.flatMap((unit) => unit.pageSlugs)
        );
        const unresolvedTiles = extractCanvasHomepageImageTiles({
          html: frontPage.body,
          courseId: canvasCourseId,
          domain,
        }).filter((tile) => !detectedPageSlugs.has(tile.pageSlug));

        if (unresolvedTiles.length > 0 && process.env.OPENAI_API_KEY) {
          try {
            const visionLabelsByPageSlug = await discoverVisionTileLabels({
              userId: user.id,
              cacheKey: `${user.id}:${courseId}:${frontPage.updated_at ?? "unknown"}:${frontPage.body.length}`,
              domain,
              accessToken,
              tiles: unresolvedTiles,
            });
            if (visionLabelsByPageSlug.size > 0) {
              homepageUnits = buildCanvasHomepageUnits({
                html: frontPage.body,
                courseId: canvasCourseId,
                domain,
                pages,
                files: homepageFiles,
                visionLabelsByPageSlug,
              });
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "Vision tile detection failed.";
            warnings.push(`Homepage tiles: ${message}`);
          }
        }
      }

      // A repeated unit index on Home is the course's student-facing
      // structure, even when Canvas Modules is hidden or contains generic data.
      if (homepageUnits.length >= 2 || (modules.length === 0 && homepageUnits.length > 0)) {
        return NextResponse.json(
          { units: homepageUnits, generated: false, structure: "homepage", warnings },
          { headers: { "Cache-Control": "private, no-store" } }
        );
      }

      if (modules.length > 0) {
        const itemResults = await Promise.all(
          modules.map(async (module) => {
            try {
              const items = await fetchCanvasModuleItems(
                domain,
                accessToken,
                canvasCourseId,
                module.id
              );
              return { moduleId: module.id, items };
            } catch (error) {
              const message = error instanceof Error ? error.message : "Canvas item request failed.";
              warnings.push(`${module.name}: ${message}`);
              return { moduleId: module.id, items: [] };
            }
          })
        );
        const itemsByModule = new Map(itemResults.map((result) => [result.moduleId, result.items]));
        const units = buildCanvasCourseUnits(modules.map((module) => ({
          module,
          items: itemsByModule.get(module.id) ?? [],
        })));

        if (units.length > 0) {
          return NextResponse.json(
            { units, generated: false, structure: "modules", warnings },
            { headers: { "Cache-Control": "private, no-store" } }
          );
        }
      }

      if (homepageUnits.length > 0) {
        return NextResponse.json(
          { units: homepageUnits, generated: false, structure: "homepage", warnings },
          { headers: { "Cache-Control": "private, no-store" } }
        );
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
      structure: "generated",
      warnings,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
