import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { summarizeNotes } from "@/lib/ai/summarizeNotes";
import { extractTextFromImage, type ImageMediaType } from "@/lib/ai/ocrImage";
import { detectFileType, extractFileText } from "@/lib/utils/extractFileText";
import { fetchCanvasAssignments, fetchCanvasFilesWide, fetchCanvasModuleItems, fetchCanvasModules, fetchCanvasPages } from "@/lib/lms/canvas";
import { extractFromGoogleLink } from "@/lib/canvas-intelligence/contentExtractor";
import type { SummaryType } from "@/types";

export const maxDuration = 90;
const IMAGE_TYPES: Record<string, ImageMediaType> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};
const STUDY_GUIDE_INSTRUCTION =
  "Use only the selected Canvas lesson content below, prioritizing Google Slides text when present. Do not invent topics that are not supported by the selected content. Include a complete Study Checklist and do not stop mid-section.";

type SelectedLessonItem = {
  itemKey?: string;
  itemId?: number;
  type?: string;
  pageUrl?: string | null;
  externalUrl?: string | null;
  contentId?: number | null;
  noteId?: string | null;
};

type PendingSyncedNoteSource = {
  title: string;
  sourceUrl: string;
  fallbackContent: string;
};

function extractGoogleSlidesId(url: string): string | null {
  const match = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
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

async function fetchGoogleSlidesText(url: string, oauthAccessToken?: string | null): Promise<string | null> {
  const slideId = extractGoogleSlidesId(url);
  if (!slideId) return null;
  const authHeaders = oauthAccessToken ? { Authorization: `Bearer ${oauthAccessToken}` } : undefined;

  const exportUrls = [
    `https://docs.google.com/presentation/d/${slideId}/export/txt`,
    `https://docs.google.com/presentation/d/${slideId}/export?format=txt`,
  ];

  for (const exportUrl of exportUrls) {
    const res = await fetch(exportUrl, { headers: authHeaders });
    if (res.ok) {
      const text = (await res.text()).replace(/\s+/g, " ").trim();
      if (text) return text;
    }
  }

  return null;
}

async function fetchGoogleSlidesAsPptxText(url: string, oauthAccessToken?: string | null): Promise<string | null> {
  const slideId = extractGoogleSlidesId(url);
  if (!slideId) return null;
  const exportUrl = `https://docs.google.com/presentation/d/${slideId}/export/pptx`;
  const res = await fetch(exportUrl, {
    headers: oauthAccessToken ? { Authorization: `Bearer ${oauthAccessToken}` } : undefined,
  });
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  return extractFileText(buffer, "pptx");
}

async function extractGoogleSlidesLessonText(params: {
  url: string;
  googleApiKey?: string;
  oauthAccessToken?: string | null;
}): Promise<string | null> {
  const direct = await fetchGoogleSlidesText(params.url, params.oauthAccessToken);
  if (direct) return direct;

  const viaPptx = await fetchGoogleSlidesAsPptxText(params.url, params.oauthAccessToken);
  if (viaPptx) return viaPptx;

  return extractFromGoogleLink({
    url: params.url,
    googleApiKey: params.googleApiKey,
    oauthAccessToken: params.oauthAccessToken ?? null,
  });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { summaryStyle = "bullet_points", courseId, lessonItemIds, lessonItems } = body as {
      summaryStyle?: SummaryType;
      courseId?: string;
      lessonItemIds?: number[];
      lessonItems?: SelectedLessonItem[];
    };
    let lessonContentIncluded = false;

    if (!courseId) {
      return NextResponse.json({ success: false, error: "courseId is required" }, { status: 400 });
    }

    if ((!Array.isArray(lessonItems) || lessonItems.length === 0) && (!Array.isArray(lessonItemIds) || lessonItemIds.length === 0)) {
      return NextResponse.json(
        { success: false, error: "Select at least one lesson source." },
        { status: 400 }
      );
    }

    const allowedStyles: SummaryType[] = ["bullet_points", "outline", "detailed", "unit_aggregate"];
    const safeStyle = allowedStyles.includes(summaryStyle) ? summaryStyle : "bullet_points";
    const googleApiKey = process.env.GOOGLE_DRIVE_API_KEY;

    const { data: course } = await supabase
      .from("courses")
      .select("id, platform, platform_id, name")
      .eq("id", courseId)
      .eq("user_id", user.id)
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
        content: lessonBlocks.join("\n\n"),
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

    const { data: connection } = await supabase
      .from("lms_connections")
      .select("access_token, canvas_domain")
      .eq("user_id", user.id)
      .eq("platform", "canvas")
      .eq("is_active", true)
      .single();

    if (!connection?.access_token || !connection.canvas_domain) {
      if (lessonBlocks.length === 0 && pendingSyncedNoteSources.length > 0) {
        for (const note of pendingSyncedNoteSources) {
          lessonBlocks.push(`# Lesson Content: Synced Notes — ${note.title}\n${note.fallbackContent.slice(0, 20000)}`);
        }
        lessonContentIncluded = true;
      }
      if (lessonBlocks.length > 0) {
        const { summary } = await summarizeNotes({
          content: lessonBlocks.join("\n\n"),
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
          const pageRes = await fetch(
            `https://${connection.canvas_domain}/api/v1/courses/${canvasCourseId}/pages/${encodeURIComponent(decodeURIComponent(pageMatch[1]))}`,
            { headers: { Authorization: `Bearer ${connection.access_token}` } }
          );
          if (pageRes.ok) {
            const page = await pageRes.json();
            sourceHtml = page?.body ?? null;
          }
        } else if (sourceUrl.hostname === connection.canvas_domain) {
          const sourceRes = await fetch(note.sourceUrl, {
            headers: { Authorization: `Bearer ${connection.access_token}` },
          });
          if (sourceRes.ok) sourceHtml = await sourceRes.text();
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

    const modules = await fetchCanvasModules(connection.canvas_domain, connection.access_token, canvasCourseId);

    const moduleItems = (
      await Promise.all(
        modules.map(async (module) => {
          const items = await fetchCanvasModuleItems(
            connection.canvas_domain,
            connection.access_token,
            canvasCourseId,
            module.id
          );
          return items.map((item) => ({
            itemKey: `ModuleItem:${item.id}`,
            moduleName: module.name,
            ...item,
          }));
        })
      )
    ).flat();

    const chosenItems = moduleItems.filter((item) => selectedBy("ModuleItem", item.id, item.content_id ?? null, item.itemKey));
    const [allFiles, pages, assignments] = await Promise.all([
      fetchCanvasFilesWide(
        connection.canvas_domain,
        connection.access_token,
        canvasCourseId,
        1000
      ),
      fetchCanvasPages(connection.canvas_domain, connection.access_token, canvasCourseId),
      fetchCanvasAssignments(connection.canvas_domain, connection.access_token, canvasCourseId),
    ]);

    // Backfill selection for courses where teachers store materials in Files but not modules.
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

    const combinedItems = [...chosenItems, ...fallbackFileItems, ...fallbackPageItems, ...fallbackAssignmentItems];

    for (const item of combinedItems) {
      let lessonText: string | null = null;

      if (item.type === "Page" && item.page_url) {
        const pageRes = await fetch(
          `https://${connection.canvas_domain}/api/v1/courses/${canvasCourseId}/pages/${encodeURIComponent(item.page_url)}`,
          { headers: { Authorization: `Bearer ${connection.access_token}` } }
        );
        if (pageRes.ok) {
          const page = await pageRes.json();
          const slideUrls = extractGoogleSlidesUrls(page?.body ?? "");
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
        const fileRes = await fetch(
          `https://${connection.canvas_domain}/api/v1/files/${item.content_id}`,
          { headers: { Authorization: `Bearer ${connection.access_token}` } }
        );
        if (fileRes.ok) {
          const fileData = await fileRes.json();
          const downloadUrl = fileData?.url;
          const contentType = fileData?.["content-type"] || fileData?.content_type || "";
          const fileType = detectFileType(contentType, fileData?.filename || fileData?.display_name || item.title);
          if (downloadUrl && fileType) {
            const downloadRes = await fetch(downloadUrl, {
              headers: { Authorization: `Bearer ${connection.access_token}` },
            });
            if (downloadRes.ok) {
              const buffer = Buffer.from(await downloadRes.arrayBuffer());
              lessonText = await extractFileText(buffer, fileType);
            }
          }
          if (downloadUrl && !lessonText) {
            const imgType = IMAGE_TYPES[(contentType ?? "").toLowerCase()];
            if (imgType) {
              const downloadRes = await fetch(downloadUrl, {
                headers: { Authorization: `Bearer ${connection.access_token}` },
              });
              if (downloadRes.ok) {
                const buffer = Buffer.from(await downloadRes.arrayBuffer());
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

    let combinedContent = lessonBlocks.join("\n\n");

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
      combinedContent = lessonBlocks.join("\n\n");
    }

    if (!combinedContent) {
      return NextResponse.json(
        { success: false, error: "No content available from lesson slides" },
        { status: 400 }
      );
    }

    const { summary } = await summarizeNotes({
      content: combinedContent,
      title: "Study Guide",
      summaryType: "unit_aggregate",
      customInstruction: `${STUDY_GUIDE_INSTRUCTION} Output style: ${safeStyle.replace("_", " ")}. Keep it student-friendly.`,
      courseName,
      maxTokens: 7000,
    });

    return NextResponse.json({ success: true, summary, lessonContentIncluded });
  } catch (err) {
    console.error("[/api/notes/study-guide] Error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
