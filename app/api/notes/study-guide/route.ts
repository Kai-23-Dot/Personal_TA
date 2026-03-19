import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { summarizeNotes } from "@/lib/ai/summarizeNotes";
import { extractFileText, mimeToFileType } from "@/lib/utils/extractFileText";
import { fetchCanvasModuleItems, fetchCanvasModules } from "@/lib/lms/canvas";
import type { SummaryType } from "@/types";

export const maxDuration = 90;

function extractGoogleSlidesId(url: string): string | null {
  const match = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function fetchGoogleSlidesText(url: string): Promise<string | null> {
  const slideId = extractGoogleSlidesId(url);
  if (!slideId) return null;

  const exportUrls = [
    `https://docs.google.com/presentation/d/${slideId}/export/txt`,
    `https://docs.google.com/presentation/d/${slideId}/export?format=txt`,
  ];

  for (const exportUrl of exportUrls) {
    const res = await fetch(exportUrl);
    if (res.ok) {
      const text = (await res.text()).replace(/\s+/g, " ").trim();
      if (text) return text;
    }
  }

  return null;
}

async function fetchGoogleSlidesAsPptxText(url: string): Promise<string | null> {
  const slideId = extractGoogleSlidesId(url);
  if (!slideId) return null;
  const exportUrl = `https://docs.google.com/presentation/d/${slideId}/export/pptx`;
  const res = await fetch(exportUrl);
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  return extractFileText(buffer, "pptx");
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { summaryStyle = "bullet_points", courseId, lessonItemIds } = body as {
      summaryStyle?: SummaryType;
      courseId?: string;
      lessonItemIds?: number[];
    };
    let lessonContentIncluded = false;

    if (!courseId) {
      return NextResponse.json({ success: false, error: "courseId is required" }, { status: 400 });
    }

    if (!Array.isArray(lessonItemIds) || lessonItemIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "lessonItemIds is required" },
        { status: 400 }
      );
    }

    const allowedStyles: SummaryType[] = ["bullet_points", "outline", "detailed", "unit_aggregate"];
    const safeStyle = allowedStyles.includes(summaryStyle) ? summaryStyle : "bullet_points";

    const { data: course } = await supabase
      .from("courses")
      .select("id, platform, platform_id, name")
      .eq("id", courseId)
      .eq("user_id", user.id)
      .single();

    if (!course || course.platform !== "canvas" || !course.platform_id) {
      return NextResponse.json({ success: false, error: "Course not linked to Canvas" }, { status: 400 });
    }

    const { data: connection } = await supabase
      .from("lms_connections")
      .select("access_token, canvas_domain")
      .eq("user_id", user.id)
      .eq("platform", "canvas")
      .eq("is_active", true)
      .single();

    if (!connection?.access_token || !connection.canvas_domain) {
      return NextResponse.json({ success: false, error: "Canvas connection missing" }, { status: 400 });
    }

    const courseName = course.name ?? undefined;
    const selectedIds = new Set(lessonItemIds.filter((id) => Number.isFinite(id)));
    const modules = await fetchCanvasModules(connection.canvas_domain, connection.access_token, Number(course.platform_id));

    const moduleItems = (
      await Promise.all(
        modules.map(async (module) => {
          const items = await fetchCanvasModuleItems(
            connection.canvas_domain,
            connection.access_token,
            Number(course.platform_id),
            module.id
          );
          return items.map((item) => ({
            moduleName: module.name,
            ...item,
          }));
        })
      )
    ).flat();

    const chosenItems = moduleItems.filter((item) => selectedIds.has(item.id));

    const lessonBlocks: string[] = [];

    for (const item of chosenItems) {
      let lessonText: string | null = null;

      if (item.type === "Page" && item.page_url) {
        const pageRes = await fetch(
          `https://${connection.canvas_domain}/api/v1/courses/${course.platform_id}/pages/${encodeURIComponent(item.page_url)}`,
          { headers: { Authorization: `Bearer ${connection.access_token}` } }
        );
        if (pageRes.ok) {
          const page = await pageRes.json();
          const bodyText = (page?.body ?? "").replace(/<[^>]*>/g, " ");
          const linkMatch = bodyText.match(/https?:\/\/docs\.google\.com\/presentation\/d\/[a-zA-Z0-9_-]+[^\s)"]*/);
          if (linkMatch) {
            lessonText = await fetchGoogleSlidesText(linkMatch[0]);
            if (!lessonText) {
              lessonText = await fetchGoogleSlidesAsPptxText(linkMatch[0]);
            }
          }
        }
      }

      if (!lessonText && item.type === "ExternalUrl" && item.external_url) {
        lessonText = await fetchGoogleSlidesText(item.external_url);
        if (!lessonText) {
          lessonText = await fetchGoogleSlidesAsPptxText(item.external_url);
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
          const fileType = mimeToFileType(contentType);
          if (downloadUrl && fileType) {
            const downloadRes = await fetch(downloadUrl, {
              headers: { Authorization: `Bearer ${connection.access_token}` },
            });
            if (downloadRes.ok) {
              const buffer = Buffer.from(await downloadRes.arrayBuffer());
              lessonText = await extractFileText(buffer, fileType);
            }
          }
        }
      }

      if (lessonText) {
        const labelParts = [item.moduleName, item.title].filter(Boolean).join(" — ");
        const lessonHeader = labelParts ? `# Lesson Content: ${labelParts}` : "# Lesson Content";
        lessonBlocks.push(`${lessonHeader}\n${lessonText}`);
        lessonContentIncluded = true;
      }
    }

    const combinedContent = lessonBlocks.join("\n\n");

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
      customInstruction: `Output style: ${safeStyle.replace("_", " ")}. Keep it student-friendly and include a study checklist.`,
      courseName,
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
