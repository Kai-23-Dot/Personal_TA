import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/backend/supabase/server";
import { summarizeNotes } from "@/backend/ai/summarizeNotes";
import { extractTextFromImage, type ImageMediaType } from "@/backend/ai/ocrImage";
import { detectFileType, extractFileText } from "@/backend/utils/extractFileText";
import {
  downloadCanvasFile,
  fetchCanvasAssignments,
  fetchCanvasFileById,
  fetchCanvasFilesWide,
  fetchCanvasModuleItems,
  fetchCanvasModules,
  fetchCanvasPageDetail,
  fetchCanvasPages,
  htmlToPlainText,
} from "@/backend/lms/canvas";
import { getCanvasCourseContext } from "@/backend/lms/canvasConnection";
import { extractFromGoogleLink } from "@/backend/canvas-intelligence/contentExtractor";
import type { SummaryType } from "@/types";
import { assertWithinLimit, UsageLimitError } from "@/backend/billing/limits";
import { runWithUsageContext } from "@/backend/billing/usageContext";

export const maxDuration = 90;
const IMAGE_TYPES: Record<string, ImageMediaType> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};
/** Max images to OCR per Canvas page (prevents runaway cost on image-heavy pages) */
const MAX_IMAGES_PER_PAGE = 5;
const MAX_SELECTED_LESSONS = 100;
const MAX_MODULES_TO_INSPECT = 60;
const MAX_STUDY_SOURCE_CHARS = 240_000;

const STUDY_GUIDE_INSTRUCTION =
  "Use only the selected Canvas lesson content below, prioritizing Google Slides text when present. Do not invent topics that are not in the selected content. Include a complete Study Checklist and do not stop mid-section. When content comes from multiple Canvas modules/units (indicated by '# Lesson Content: Unit Name —' prefixes in the source), organize the output with a '## Unit: [Name]' header for each module before listing its topics.";

type PendingSyncedNoteSource = {
  title: string;
  sourceUrl: string;
  fallbackContent: string;
};

const lessonItemSchema = z.object({
  itemKey: z.string().trim().max(200).optional(),
  itemId: z.number().int().positive().optional(),
  type: z.string().trim().max(64).optional(),
  pageUrl: z.string().max(2048).nullable().optional(),
  externalUrl: z.string().max(2048).nullable().optional(),
  contentId: z.number().int().positive().nullable().optional(),
  noteId: z.string().uuid().nullable().optional(),
});

const studyGuideSchema = z.object({
  summaryStyle: z
    .enum(["bullet_points", "outline", "detailed", "unit_aggregate"])
    .default("bullet_points"),
  courseId: z.string().uuid(),
  lessonItemIds: z.array(z.number().int().positive()).max(MAX_SELECTED_LESSONS).optional(),
  lessonItems: z.array(lessonItemSchema).max(MAX_SELECTED_LESSONS).optional(),
  unitName: z.string().trim().min(1).max(120).optional(),
}).strict().superRefine((value, context) => {
  if (
    !value.unitName &&
    (value.lessonItems?.length ?? 0) === 0 &&
    (value.lessonItemIds?.length ?? 0) === 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select at least one lesson source or enter a unit name.",
    });
  }
});

function boundedStudyContent(blocks: string[]): string {
  return blocks.join("\n\n").slice(0, MAX_STUDY_SOURCE_CHARS);
}

function extractGoogleSlidesUrls(value: string | null | undefined): string[] {
  if (!value) return [];
  const urls = new Set<string>();
  for (const match of value.matchAll(/https?:\/\/docs\.google\.com\/presentation\/d\/[a-zA-Z0-9_-]+[^\s"'<>)]*/g)) {
    urls.add(match[0].replace(/&amp;/g, "&"));
  }
  for (const match of value.matchAll(/(?:href|src)\s*=\s*["']([^"']*docs\.google\.com\/presentation\/d\/[^"']+)["']/gi)) {
    const raw = match[1].replace(/&amp;/g, "&");
    urls.add(raw.startsWith("http") ? raw : `https://${raw.replace(/^\/\//, "")}`);
  }
  return [...urls];
}

async function extractGoogleSlidesLessonText(params: {
  url: string;
  googleApiKey?: string;
  oauthAccessToken?: string | null;
}): Promise<string | null> {
  return extractFromGoogleLink({
    url: params.url,
    googleApiKey: params.googleApiKey,
    oauthAccessToken: params.oauthAccessToken ?? null,
  });
}

/**
 * Parse <img> src URLs from Canvas page HTML.
 * Only returns Canvas-hosted images (same domain or /files/ paths); skips tiny icons.
 */
function extractCanvasImageUrls(html: string, domain: string): string[] {
  const urls: string[] = [];
  const re = /src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const src = m[1];
    if (
      (src.includes(domain) || src.startsWith("/") || /\/files\/\d+/.test(src)) &&
      !/favicon|avatar|icon\.png|logo\.|emoji/i.test(src)
    ) {
      urls.push(src.startsWith("http") ? src : `https://${domain}${src.startsWith("/") ? "" : "/"}${src}`);
    }
  }
  return [...new Set(urls)].slice(0, MAX_IMAGES_PER_PAGE);
}

/**
 * Download a Canvas-hosted image (bearer auth required) and OCR it with the vision model.
 * Returns the structured OCR text, or null if download or OCR fails.
 */
async function ocrCanvasImage(
  url: string,
  domain: string,
  accessToken: string,
  context: string
): Promise<string | null> {
  try {
    const { buffer, contentType: ct } = await downloadCanvasFile(
      domain,
      accessToken,
      url,
      5 * 1024 * 1024
    );
    const imgType = IMAGE_TYPES[ct];
    if (!imgType) return null;
    const ocr = await extractTextFromImage(buffer, imgType, context);
    return ocr.structuredContent || ocr.extractedText || null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const creditCheck = await assertWithinLimit(user.id, "ai_credits");
    if (!creditCheck.ok) {
      return NextResponse.json(
        { success: false, error: creditCheck.reason, code: "LIMIT_REACHED" },
        { status: 402 }
      );
    }

    return runWithUsageContext(user.id, async () => {

    const parsed = studyGuideSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Invalid study-guide request.",
        },
        { status: 400 }
      );
    }
    const { summaryStyle, courseId, lessonItemIds, lessonItems, unitName } = parsed.data;
    let lessonContentIncluded = false;
    const isUnitMode = Boolean(unitName?.trim());
    const safeStyle: SummaryType = summaryStyle;
    const googleApiKey = process.env.GOOGLE_DRIVE_API_KEY;

    const { data: course } = await supabase
      .from("courses")
      .select("id, platform, platform_id, name")
      .eq("id", courseId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (!course || course.platform !== "canvas" || !course.platform_id) {
      return NextResponse.json({ success: false, error: "Course not linked to Canvas" }, { status: 400 });
    }

    const courseName = course.name ?? undefined;
    const canvasCourseId = Number(course.platform_id);
    if (!Number.isFinite(canvasCourseId)) {
      return NextResponse.json({ success: false, error: "Invalid Canvas course ID on this course. Re-sync this course." }, { status: 400 });
    }
    const selectedLessonItems = Array.isArray(lessonItems) ? lessonItems : [];
    const selectedIds = new Set((lessonItemIds ?? []).filter((id) => Number.isFinite(id)));
    for (const item of selectedLessonItems) {
      if (Number.isFinite(item.itemId)) selectedIds.add(item.itemId as number);
      if (Number.isFinite(item.contentId)) selectedIds.add(item.contentId as number);
    }
    const selectedKeys = new Set(selectedLessonItems.map((item) => item.itemKey).filter(Boolean));
    const selectedNoteIds = selectedLessonItems
      .map((item) => item.noteId)
      .filter((noteId): noteId is string => Boolean(noteId));
    const hasNonNoteSelection = selectedLessonItems.length === 0 || selectedLessonItems.some((item) => item.type !== "SyncedNote");

    const selectedBy = (type: string, itemId?: number | null, contentId?: number | null, itemKey?: string | null) =>
      Boolean((itemKey && selectedKeys.has(itemKey)) || (Number.isFinite(itemId) && selectedIds.has(itemId as number)) || (Number.isFinite(contentId) && selectedIds.has(contentId as number)));

    const lessonBlocks: string[] = [];
    const pendingSyncedNoteSources: PendingSyncedNoteSource[] = [];

    if (selectedNoteIds.length > 0) {
      const { data: googleConn } = await supabase
        .from("lms_connections")
        .select("access_token")
        .eq("user_id", user.id)
        .eq("platform", "google_classroom")
        .eq("is_active", true)
        .maybeSingle();

      const { data: selectedNotes } = await supabase
        .from("notes")
        .select("id, title, content, source_url")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .in("id", selectedNoteIds)
        .not("content", "is", null);

      for (const note of selectedNotes ?? []) {
        if (!note.content) continue;
        const slideUrls = [
          ...extractGoogleSlidesUrls(note.source_url),
          ...extractGoogleSlidesUrls(note.content as string),
        ];
        const slideBlocks: string[] = [];
        for (const slideUrl of slideUrls) {
          const slideText = await extractGoogleSlidesLessonText({
            url: slideUrl,
            googleApiKey,
            oauthAccessToken: googleConn?.access_token ?? null,
          });
          if (slideText) {
            slideBlocks.push(`# Google Slides Content: ${note.title}\nSource: ${slideUrl}\n${slideText.slice(0, 20000)}`);
          }
        }

        if (slideBlocks.length > 0) {
          lessonBlocks.push(...slideBlocks);
        } else if (note.source_url) {
          pendingSyncedNoteSources.push({
            title: note.title,
            sourceUrl: note.source_url,
            fallbackContent: note.content as string,
          });
        } else {
          lessonBlocks.push(`# Lesson Content: Synced Notes — ${note.title}\n${(note.content as string).slice(0, 20000)}`);
        }
        lessonContentIncluded = true;
      }
    }

    if (!hasNonNoteSelection && lessonBlocks.length > 0 && pendingSyncedNoteSources.length === 0) {
      const { summary } = await summarizeNotes({
        content: boundedStudyContent(lessonBlocks),
        title: "Study Guide",
        summaryType: "unit_aggregate",
        customInstruction: `${STUDY_GUIDE_INSTRUCTION} Output style: ${safeStyle.replace("_", " ")}. Keep it student-friendly.`,
        courseName,
        maxTokens: 7000,
      });

      return NextResponse.json({ success: true, summary, lessonContentIncluded });
    }

    if (!hasNonNoteSelection && pendingSyncedNoteSources.length === 0) {
      return NextResponse.json(
        { success: false, error: "Selected synced notes do not have readable content yet. Re-sync Canvas and try again." },
        { status: 400 }
      );
    }

    const canvasContext = await getCanvasCourseContext(
      supabase,
      user.id,
      courseId
    );
    const connection = canvasContext?.connection;

    if (!connection?.access_token || !connection.canvas_domain) {
      if (lessonBlocks.length === 0 && pendingSyncedNoteSources.length > 0) {
        for (const note of pendingSyncedNoteSources) {
          lessonBlocks.push(`# Lesson Content: Synced Notes — ${note.title}\n${note.fallbackContent.slice(0, 20000)}`);
        }
        lessonContentIncluded = true;
      }
      if (lessonBlocks.length > 0) {
        const { summary } = await summarizeNotes({
          content: boundedStudyContent(lessonBlocks),
          title: "Study Guide",
          summaryType: "unit_aggregate",
          customInstruction: `${STUDY_GUIDE_INSTRUCTION} Output style: ${safeStyle.replace("_", " ")}. Keep it student-friendly.`,
          courseName,
          maxTokens: 7000,
        });

        return NextResponse.json({ success: true, summary, lessonContentIncluded });
      }
      return NextResponse.json({ success: false, error: "Canvas connection missing" }, { status: 400 });
    }

    const { data: googleConn } = await supabase
      .from("lms_connections")
      .select("access_token")
      .eq("user_id", user.id)
      .eq("platform", "google_classroom")
      .eq("is_active", true)
      .maybeSingle();

    for (const note of pendingSyncedNoteSources) {
      let slideTextFromSource: string | null = null;
      try {
        const sourceUrl = new URL(note.sourceUrl);
        let sourceHtml: string | null = null;
        const pageMatch = sourceUrl.hostname === connection.canvas_domain
          ? sourceUrl.pathname.match(/\/courses\/\d+\/pages\/([^/?#]+)/)
          : null;

        if (pageMatch) {
          const page = await fetchCanvasPageDetail(
            connection.canvas_domain,
            connection.access_token,
            canvasCourseId,
            decodeURIComponent(pageMatch[1])
          );
          sourceHtml = page?.body ?? null;
        } else if (sourceUrl.hostname === connection.canvas_domain) {
          const sourceRes = await fetch(note.sourceUrl, {
            headers: { Authorization: `Bearer ${connection.access_token}` },
            redirect: "error",
            signal: AbortSignal.timeout(15_000),
          });
          if (sourceRes.ok) sourceHtml = (await sourceRes.text()).slice(0, 250_000);
        }

        for (const slideUrl of extractGoogleSlidesUrls(sourceHtml)) {
          slideTextFromSource = await extractGoogleSlidesLessonText({
            url: slideUrl,
            googleApiKey,
            oauthAccessToken: googleConn?.access_token ?? null,
          });
          if (slideTextFromSource) {
            lessonBlocks.push(`# Google Slides Content: ${note.title}\nSource: ${slideUrl}\n${slideTextFromSource.slice(0, 20000)}`);
            break;
          }
        }
      } catch {
        slideTextFromSource = null;
      }

      if (!slideTextFromSource) {
        lessonBlocks.push(`# Lesson Content: Synced Notes — ${note.title}\n${note.fallbackContent.slice(0, 20000)}`);
      }
      lessonContentIncluded = true;
    }

    const allModules = (
      await fetchCanvasModules(
        connection.canvas_domain,
        connection.access_token,
        canvasCourseId
      )
    ).slice(0, MAX_MODULES_TO_INSPECT);

    let combinedItems: Array<{
      id: number;
      itemKey: string;
      moduleName: string;
      title: string;
      type: string;
      page_url: string | null;
      external_url: string | null;
      content_id: number | null;
    }>;
    let assignments: Awaited<ReturnType<typeof fetchCanvasAssignments>>;

    if (isUnitMode && unitName) {
      // ── Unit-name mode: find modules whose name contains the typed unit ──
      const needle = unitName.trim().toLowerCase();
      const matchedModules = allModules
        .filter((m) => m.name.toLowerCase().includes(needle))
        .slice(0, MAX_MODULES_TO_INSPECT);

      if (matchedModules.length === 0) {
        return NextResponse.json(
          { success: false, error: `No Canvas modules found matching "${unitName}". Check the exact module name in your Canvas course.` },
          { status: 404 }
        );
      }

      assignments = await fetchCanvasAssignments(connection.canvas_domain, connection.access_token, canvasCourseId);

      combinedItems = (
        await Promise.all(
          matchedModules.map(async (module) => {
            const items = await fetchCanvasModuleItems(
              connection.canvas_domain,
              connection.access_token,
              canvasCourseId,
              module.id
            );
            return items.map((item) => ({
              id: item.id,
              itemKey: `ModuleItem:${item.id}`,
              moduleName: module.name,
              title: item.title,
              type: item.type,
              page_url: item.page_url ?? null,
              external_url: item.external_url ?? null,
              content_id: item.content_id ?? null,
            }));
          })
        )
      ).flat().slice(0, MAX_SELECTED_LESSONS);

      if (combinedItems.length === 0) {
        return NextResponse.json(
          { success: false, error: `Module "${unitName}" was found but has no items yet. Sync Canvas and try again.` },
          { status: 400 }
        );
      }
    } else {
      // ── Checklist mode: use only the items the user explicitly selected ──
      const moduleItems = (
        await Promise.all(
          allModules.map(async (module) => {
            const items = await fetchCanvasModuleItems(
              connection.canvas_domain,
              connection.access_token,
              canvasCourseId,
              module.id
            );
            return items.map((item) => ({
              id: item.id,
              itemKey: `ModuleItem:${item.id}`,
              moduleName: module.name,
              title: item.title,
              type: item.type,
              page_url: item.page_url ?? null,
              external_url: item.external_url ?? null,
              content_id: item.content_id ?? null,
            }));
          })
        )
      ).flat();

      const chosenItems = moduleItems.filter((item) => selectedBy("ModuleItem", item.id, item.content_id, item.itemKey));
      const [allFiles, pages, assignments_] = await Promise.all([
        fetchCanvasFilesWide(connection.canvas_domain, connection.access_token, canvasCourseId, 1000),
        fetchCanvasPages(connection.canvas_domain, connection.access_token, canvasCourseId),
        fetchCanvasAssignments(connection.canvas_domain, connection.access_token, canvasCourseId),
      ]);
      assignments = assignments_;

      const fallbackFileItems = allFiles
        .filter((file) => selectedBy("File", file.id, file.id, `File:${file.id}`))
        .map((file) => ({
          id: file.id,
          itemKey: `File:${file.id}`,
          moduleName: "Course Files",
          title: file.display_name || file.filename,
          type: "File",
          page_url: null as string | null,
          external_url: null as string | null,
          content_id: file.id,
        }));

      const fallbackPageItems = pages
        .filter((page) => selectedBy("Page", page.page_id, null, `Page:${page.page_id}`))
        .map((page) => ({
          id: page.page_id,
          itemKey: `Page:${page.page_id}`,
          moduleName: "Course Pages",
          title: page.title,
          type: "Page",
          page_url: page.url,
          external_url: null as string | null,
          content_id: null as number | null,
        }));

      const fallbackAssignmentItems = assignments
        .filter((a) => selectedBy("Assignment", a.id, a.id, `Assignment:${a.id}`))
        .map((a) => ({
          id: a.id,
          itemKey: `Assignment:${a.id}`,
          moduleName: "Assignments",
          title: a.name,
          type: "Assignment",
          page_url: null as string | null,
          external_url: null as string | null,
          content_id: a.id,
        }));

      combinedItems = [
        ...chosenItems,
        ...fallbackFileItems,
        ...fallbackPageItems,
        ...fallbackAssignmentItems,
      ].slice(0, MAX_SELECTED_LESSONS);
    }

    for (const item of combinedItems) {
      let lessonText: string | null = null;

      if (item.type === "Page" && item.page_url) {
        const page = await fetchCanvasPageDetail(
          connection.canvas_domain,
          connection.access_token,
          canvasCourseId,
          item.page_url
        );
        if (page) {
          const html = page?.body ?? "";

          // 1. Google Slides (highest quality when present)
          for (const slideUrl of extractGoogleSlidesUrls(html)) {
            const slideText = await extractGoogleSlidesLessonText({
              url: slideUrl,
              googleApiKey,
              oauthAccessToken: googleConn?.access_token ?? null,
            });
            if (slideText) {
              lessonText = `Source Google Slides: ${slideUrl}\n${slideText}`;
              break;
            }
          }

          // 2. Plain text from the page HTML body (always extract — catches typed notes,
          //    definitions, formulas written as text, etc.)
          const bodyText = htmlToPlainText(html) ?? "";
          if (bodyText.length > 50) {
            lessonText = lessonText ? `${lessonText}\n\n${bodyText}` : bodyText;
          }

          // 3. Vision OCR for embedded images (math diagrams, handwritten notes,
          //    formula screenshots, etc. — common in math/science courses)
          const imageUrls = extractCanvasImageUrls(html, connection.canvas_domain);
          if (imageUrls.length > 0) {
            const ocrTexts = await Promise.all(
              imageUrls.map((imgUrl) =>
                ocrCanvasImage(
                  imgUrl,
                  connection.canvas_domain,
                  connection.access_token,
                  `${courseName ?? "class"} notes`
                )
              )
            );
            const imageContent = ocrTexts.filter(Boolean).join("\n\n---\n\n");
            if (imageContent) {
              lessonText = lessonText
                ? `${lessonText}\n\n## Images on Page\n${imageContent}`
                : `## Images on Page\n${imageContent}`;
            }
          }
        }
      }

      if (!lessonText && item.external_url) {
        const slideUrls = extractGoogleSlidesUrls(item.external_url);
        for (const slideUrl of slideUrls) {
          lessonText = await extractGoogleSlidesLessonText({
            url: slideUrl,
            googleApiKey,
            oauthAccessToken: googleConn?.access_token ?? null,
          });
          if (lessonText) {
            lessonText = `Source Google Slides: ${slideUrl}\n${lessonText}`;
            break;
          }
        }
      }

      if (!lessonText && item.type === "File" && item.content_id) {
        const fileData = await fetchCanvasFileById(
          connection.canvas_domain,
          connection.access_token,
          canvasCourseId,
          item.content_id
        );
        if (fileData) {
          const downloadUrl = fileData?.url;
          const contentType = fileData?.["content-type"] || fileData?.content_type || "";
          const fileType = detectFileType(contentType, fileData?.filename || fileData?.display_name || item.title);
          if (downloadUrl && fileType) {
            if (!fileData.size || fileData.size <= 20 * 1024 * 1024) {
              const { buffer } = await downloadCanvasFile(
                connection.canvas_domain,
                connection.access_token,
                downloadUrl,
                20 * 1024 * 1024
              );
              lessonText = await extractFileText(buffer, fileType);
            }
          }
          if (downloadUrl && !lessonText) {
            const imgType = IMAGE_TYPES[(contentType ?? "").toLowerCase()];
            if (imgType) {
              if (!fileData.size || fileData.size <= 5 * 1024 * 1024) {
                const { buffer } = await downloadCanvasFile(
                  connection.canvas_domain,
                  connection.access_token,
                  downloadUrl,
                  5 * 1024 * 1024
                );
                const ocr = await extractTextFromImage(buffer, imgType, `${course.name} class notes`);
                lessonText = ocr.structuredContent || ocr.extractedText || null;
              }
            }
          }
        }
      }

      if (!lessonText && item.type === "Assignment" && item.content_id) {
        const assignment = assignments.find((a) => a.id === item.content_id);
        lessonText = assignment?.description?.replace(/<[^>]*>/g, " ").trim() || null;
      }

      if (lessonText) {
        const labelParts = [item.moduleName, item.title].filter(Boolean).join(" — ");
        const lessonHeader = labelParts ? `# Lesson Content: ${labelParts}` : "# Lesson Content";
        lessonBlocks.push(`${lessonHeader}\n${lessonText}`);
        lessonContentIncluded = true;
      }
    }

    let combinedContent = boundedStudyContent(lessonBlocks);

    if (!combinedContent) {
      // Final fallback: selected "Synced Notes" pseudo-items (from module-items endpoint)
      const { data: syncedNotes } = await supabase
        .from("notes")
        .select("id, title, content, updated_at")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .not("content", "is", null)
        .order("updated_at", { ascending: false })
        .limit(500);

      const selectedNoteBlocks = (syncedNotes ?? [])
        .filter((n) => {
          const syntheticId = Number.parseInt(n.id.replace(/-/g, "").slice(0, 9), 16) || 0;
          return (syntheticId > 0 && selectedIds.has(syntheticId)) || selectedKeys.has(`SyncedNote:${n.id}`);
        })
        .map((n) => `# Lesson Content: Synced Notes — ${n.title}\n${(n.content ?? "").slice(0, 20000)}`);

      if (selectedNoteBlocks.length > 0) {
        lessonBlocks.push(...selectedNoteBlocks);
        lessonContentIncluded = true;
      }
      combinedContent = boundedStudyContent(lessonBlocks);
    }

    if (!combinedContent) {
      return NextResponse.json(
        { success: false, error: "No content available from lesson slides" },
        { status: 400 }
      );
    }

    const { summary } = await summarizeNotes({
      content: combinedContent,
      title: isUnitMode && unitName ? `${unitName} Study Guide` : "Study Guide",
      summaryType: "unit_aggregate",
      customInstruction: `${STUDY_GUIDE_INSTRUCTION}${isUnitMode && unitName ? ` Focus exclusively on "${unitName}" content — do not include topics from other modules.` : ""} Output style: ${safeStyle.replace("_", " ")}. Keep it student-friendly.`,
      courseName,
      maxTokens: 7000,
    });

    return NextResponse.json({ success: true, summary, lessonContentIncluded });
    });
  } catch (err) {
    console.error("[/api/notes/study-guide] Error:", err);
    if (err instanceof UsageLimitError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: 402 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Could not generate the study guide." },
      { status: 500 }
    );
  }
}
