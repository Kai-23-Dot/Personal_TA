import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/backend/supabase/server";
import {
  fetchCanvasFilesWide,
  fetchCanvasFrontPage,
  fetchCanvasPageDetail,
  fetchCanvasModuleItems,
  fetchCanvasModules,
  fetchCanvasPages,
  downloadCanvasFile,
} from "@/backend/lms/canvas";
import { getCanvasCourseContext } from "@/backend/lms/canvasConnection";
import { buildGeneratedCourseUnits, type CourseUnitMaterial } from "@/backend/lms/courseUnits";
import {
  buildCanvasCourseUnits,
  isCanvasAdministrativeSectionName,
} from "@/backend/canvas-intelligence/moduleScope";
import {
  buildCanvasPageUnits,
  buildCanvasHomepageUnits,
  countCanvasHomepageImagePageLinks,
  extractCanvasHtmlResourceLinks,
  extractCanvasHomepageImageTiles,
  isExplicitCanvasUnitName,
  mergeCanvasCourseUnits,
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
const MAX_LINKED_HOMEPAGE_PAGES = 6;
const VISION_CACHE_TTL_MS = 30 * 60 * 1000;
const HOMEPAGE_INDEX_LABEL =
  /\b(?:course\s*(?:home|overview)|curriculum|home(?:page)?|landing|start\s+here|unit\s+index)\b/i;
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

/**
 * Some Canvas courses set a lightweight wrapper as `front_page` and link the
 * real graphical unit index from it. Follow only a small number of likely
 * index Pages and stop as soon as a repeated unit structure is found.
 */
async function discoverLinkedHomepageUnits(params: {
  rootHtml: string;
  courseId: number;
  domain: string;
  accessToken: string;
  pages: Awaited<ReturnType<typeof fetchCanvasPages>>;
  files: Awaited<ReturnType<typeof fetchCanvasFilesWide>>;
  warnings: string[];
}) {
  const pageBySlug = new Map(params.pages.map((page) => [page.url, page]));
  const visited = new Set<string>();
  let frontier = extractCanvasHtmlResourceLinks({
    html: params.rootHtml,
    courseId: params.courseId,
    domain: params.domain,
  }).pageSlugs
    .filter((slug) => {
      const label = `${pageBySlug.get(slug)?.title ?? ""} ${slug.replace(/[-_]+/g, " ")}`;
      return HOMEPAGE_INDEX_LABEL.test(label) && !isExplicitCanvasUnitName(label);
    })
    .slice(0, MAX_LINKED_HOMEPAGE_PAGES);
  let discovered = [] as ReturnType<typeof buildCanvasHomepageUnits>;

  for (let depth = 0; depth < 2 && frontier.length > 0; depth++) {
    const batch = frontier
      .filter((slug) => !visited.has(slug))
      .slice(0, MAX_LINKED_HOMEPAGE_PAGES - visited.size);
    batch.forEach((slug) => visited.add(slug));
    if (batch.length === 0) break;

    const results = await Promise.allSettled(
      batch.map((slug) =>
        fetchCanvasPageDetail(
          params.domain,
          params.accessToken,
          params.courseId,
          slug
        )
      )
    );
    const next = new Set<string>();
    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      if (result.status !== "fulfilled" || !result.value?.body) {
        if (result.status === "rejected") {
          const message = result.reason instanceof Error
            ? result.reason.message
            : "Canvas page request failed.";
          params.warnings.push(`Homepage ${batch[index]}: ${message}`);
        }
        continue;
      }
      discovered = mergeCanvasCourseUnits(
        discovered,
        buildCanvasHomepageUnits({
          html: result.value.body,
          courseId: params.courseId,
          domain: params.domain,
          pages: params.pages,
          files: params.files,
        })
      );
      if (discovered.length >= 2) return discovered;

      for (const slug of extractCanvasHtmlResourceLinks({
        html: result.value.body,
        courseId: params.courseId,
        domain: params.domain,
      }).pageSlugs) {
        const label = `${pageBySlug.get(slug)?.title ?? ""} ${slug.replace(/[-_]+/g, " ")}`;
        if (
          !visited.has(slug) &&
          HOMEPAGE_INDEX_LABEL.test(label) &&
          !isExplicitCanvasUnitName(label)
        ) {
          next.add(slug);
        }
      }
    }
    frontier = [...next];
  }

  return discovered;
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

      if (frontPage?.body && homepageUnits.length < 2) {
        homepageUnits = mergeCanvasCourseUnits(
          homepageUnits,
          await discoverLinkedHomepageUnits({
            rootHtml: frontPage.body,
            courseId: canvasCourseId,
            domain,
            accessToken,
            pages,
            files: homepageFiles,
            warnings,
          })
        );
      }

      // `front_page` can fail independently even while the Pages endpoint is
      // healthy. Reconstruct and group Unit/Module/Chapter pages so a transient
      // Home-page failure never exposes administrative module subheaders.
      const pageUnits = buildCanvasPageUnits(pages);
      const discoveredUnits = mergeCanvasCourseUnits(homepageUnits, pageUnits);

      // A repeated unit index on Home is the course's student-facing
      // structure, even when Canvas Modules is hidden or contains generic data.
      if (
        discoveredUnits.length >= 2 ||
        (modules.length === 0 && discoveredUnits.length > 0)
      ) {
        return NextResponse.json(
          {
            units: discoveredUnits,
            generated: false,
            structure: homepageUnits.length > 0 ? "homepage" : "pages",
            warnings,
          },
          {
            headers: {
              "Cache-Control": "private, no-store",
              "X-Smartlearn-Unit-Discovery": "canvas-v2",
            },
          }
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
        }))).filter(
          (unit) => !isCanvasAdministrativeSectionName(unit.moduleName)
        );

        const mergedUnits = discoveredUnits.length > 0
          ? mergeCanvasCourseUnits(
              discoveredUnits,
              units.filter((unit) => isExplicitCanvasUnitName(unit.moduleName))
            )
          : units;

        if (mergedUnits.length > 0) {
          return NextResponse.json(
            {
              units: mergedUnits,
              generated: false,
              structure: discoveredUnits.length > 0 ? "hybrid" : "modules",
              warnings,
            },
            { headers: { "Cache-Control": "private, no-store" } }
          );
        }
      }

      if (discoveredUnits.length > 0) {
        return NextResponse.json(
          {
            units: discoveredUnits,
            generated: false,
            structure: homepageUnits.length > 0 ? "homepage" : "pages",
            warnings,
          },
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
