import {
  fetchCanvasAssignments,
  fetchCanvasAnnouncements,
  fetchCanvasCalendarEvents,
  fetchCanvasCourseSyllabus,
  fetchCanvasDiscussionTopics,
  fetchCanvasFiles,
  fetchCanvasFolders,
  fetchCanvasModuleItems,
  fetchCanvasModules,
  fetchCanvasPageDetail,
  fetchCanvasPages,
  fetchCanvasQuizzes,
} from "@/lib/lms/canvas";
import type { CanvasContentItem } from "./types";

function extractLinksFromHtml(html: string | null | undefined): string[] {
  if (!html) return [];
  const urls = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) urls.add(m[1]);
  for (const m of html.matchAll(/https?:\/\/[^\s"')]+/gi)) urls.add(m[0]);
  return [...urls].slice(0, 30);
}

export async function crawlCanvasCourseContent(params: {
  domain: string;
  accessToken: string;
  canvasCourseId: number;
  localCourseId: string;
}): Promise<CanvasContentItem[]> {
  const { domain, accessToken, canvasCourseId, localCourseId } = params;

  const [pages, assignments, files, folders, modules, discussions, quizzes, syllabus, announcements, calendarEvents] = await Promise.all([
    fetchCanvasPages(domain, accessToken, canvasCourseId),
    fetchCanvasAssignments(domain, accessToken, canvasCourseId),
    fetchCanvasFiles(domain, accessToken, canvasCourseId, 100),
    fetchCanvasFolders(domain, accessToken, canvasCourseId),
    fetchCanvasModules(domain, accessToken, canvasCourseId),
    fetchCanvasDiscussionTopics(domain, accessToken, canvasCourseId),
    fetchCanvasQuizzes(domain, accessToken, canvasCourseId),
    fetchCanvasCourseSyllabus(domain, accessToken, canvasCourseId),
    fetchCanvasAnnouncements(domain, accessToken, canvasCourseId),
    fetchCanvasCalendarEvents(domain, accessToken, canvasCourseId),
  ]);

  const items: CanvasContentItem[] = [];

  const folderById = new Map<number, string>();
  for (const f of folders) folderById.set(f.id, f.full_name ?? f.name);

  for (const p of pages) {
    const detail = await fetchCanvasPageDetail(domain, accessToken, canvasCourseId, p.url);
    const links = extractLinksFromHtml(detail?.body ?? null);
    items.push({
      id: `page_${p.page_id}`,
      courseId: localCourseId,
      canvasCourseId,
      sourceType: "page",
      type: "page",
      title: p.title,
      bodyText: detail?.body ?? null,
      html: detail?.body ?? null,
      sourceUrl: `https://${domain}/courses/${canvasCourseId}/pages/${p.url}`,
      url: `https://${domain}/courses/${canvasCourseId}/pages/${p.url}`,
      bodyHtml: detail?.body ?? null,
      textContent: detail?.body ?? null,
      createdAt: p.created_at ?? null,
      updatedAt: p.updated_at,
      dueDate: null,
      linkedFromModule: false,
      linkedFrom: null,
      metadata: { pageId: p.page_id, embeddedLinks: links },
    });
    for (const link of links) {
      items.push({
        id: `page_${p.page_id}_link_${Buffer.from(link).toString("base64").slice(0, 16)}`,
        courseId: localCourseId,
        canvasCourseId,
        sourceType: "external_link",
        type: "external_link",
        title: `${p.title} (linked resource)`,
        sourceUrl: link,
        url: link,
        textContent: link,
        linkedFromModule: false,
        linkedFrom: `page_${p.page_id}`,
        metadata: { parentType: "page", parentId: p.page_id },
      });
    }
  }

  for (const a of assignments) {
    const links = extractLinksFromHtml(a.description ?? null);
    items.push({
      id: `assignment_${a.id}`,
      courseId: localCourseId,
      canvasCourseId,
      sourceType: "assignment",
      type: "assignment",
      title: a.name,
      sourceUrl: a.html_url,
      url: a.html_url,
      html: a.description ?? null,
      bodyText: a.description ?? null,
      textContent: a.description ?? null,
      createdAt: a.unlock_at ?? null,
      updatedAt: a.unlock_at ?? a.due_at ?? null,
      dueAt: a.due_at,
      dueDate: a.due_at,
      linkedFromModule: false,
      linkedFrom: null,
      metadata: { submissionTypes: a.submission_types, embeddedLinks: links },
    });
    for (const link of links) {
      items.push({
        id: `assignment_${a.id}_link_${Buffer.from(link).toString("base64").slice(0, 16)}`,
        courseId: localCourseId,
        canvasCourseId,
        sourceType: "external_link",
        type: "external_link",
        title: `${a.name} (linked resource)`,
        sourceUrl: link,
        url: link,
        textContent: link,
        linkedFromModule: false,
        linkedFrom: `assignment_${a.id}`,
        metadata: { parentType: "assignment", parentId: a.id },
      });
    }
  }

  for (const f of files) {
    items.push({
      id: `file_${f.id}`,
      courseId: localCourseId,
      canvasCourseId,
      sourceType: "file",
      type: "file",
      title: f.display_name,
      sourceUrl: f.url,
      url: f.url,
      folderPath: (f as unknown as { folder_id?: number }).folder_id ? folderById.get((f as unknown as { folder_id: number }).folder_id) ?? null : null,
      updatedAt: f.updated_at,
      linkedFromModule: false,
      linkedFrom: null,
      fileMimeType: f["content-type"] ?? f.content_type,
      fileSize: f.size,
      contentId: f.id,
      metadata: {},
    });
  }

  for (const m of modules) {
    const moduleItems = await fetchCanvasModuleItems(domain, accessToken, canvasCourseId, m.id);
    for (const mi of moduleItems) {
      items.push({
        id: `module_item_${mi.id}`,
        courseId: localCourseId,
        canvasCourseId,
        sourceType: "module_item",
        type: "module_item",
        title: mi.title,
        sourceUrl: mi.html_url,
        url: mi.html_url,
        externalUrl: mi.external_url,
        updatedAt: null,
        moduleName: m.name,
        modulePosition: m.position,
        itemPosition: mi.position,
        linkedFromModule: true,
        linkedFrom: `module_${m.id}`,
        contentId: mi.content_id,
        metadata: { moduleId: m.id, itemType: mi.type, pageUrl: mi.page_url },
      });
      if (mi.external_url) {
        items.push({
          id: `module_item_${mi.id}_external`,
          courseId: localCourseId,
          canvasCourseId,
          sourceType: "external_link",
          type: "external_link",
          title: `${mi.title} (external link)`,
          sourceUrl: mi.external_url,
          url: mi.external_url,
          textContent: mi.external_url,
          moduleName: m.name,
          linkedFromModule: true,
          linkedFrom: `module_item_${mi.id}`,
          metadata: { moduleId: m.id, itemType: mi.type },
        });
      }
    }
  }

  for (const d of discussions) {
    items.push({
      id: `discussion_${d.id}`,
      courseId: localCourseId,
      canvasCourseId,
      sourceType: "discussion",
      type: "discussion",
      title: d.title,
      sourceUrl: d.html_url,
      url: d.html_url,
      updatedAt: d.updated_at,
      linkedFromModule: false,
      linkedFrom: null,
      metadata: { discussionType: d.discussion_type },
    });
  }

  for (const q of quizzes) {
    items.push({
      id: `quiz_${q.id}`,
      courseId: localCourseId,
      canvasCourseId,
      sourceType: "quiz",
      type: "quiz",
      title: q.title,
      sourceUrl: q.html_url,
      url: q.html_url,
      dueAt: q.due_at,
      dueDate: q.due_at,
      updatedAt: q.unlock_at ?? q.due_at ?? null,
      linkedFromModule: false,
      linkedFrom: null,
      metadata: { points: q.points_possible, questions: q.question_count },
    });
  }

  if (syllabus) {
    items.push({
      id: `syllabus_${canvasCourseId}`,
      courseId: localCourseId,
      canvasCourseId,
      sourceType: "syllabus",
      type: "syllabus",
      title: "Course Syllabus",
      bodyText: syllabus,
      textContent: syllabus,
      sourceUrl: `https://${domain}/courses/${canvasCourseId}/assignments/syllabus`,
      url: `https://${domain}/courses/${canvasCourseId}/assignments/syllabus`,
      linkedFromModule: false,
      linkedFrom: null,
      metadata: {},
    });
  }

  for (const a of announcements) {
    items.push({
      id: `announcement_${a.id}`,
      courseId: localCourseId,
      canvasCourseId,
      sourceType: "announcement",
      type: "announcement",
      title: a.title,
      bodyText: a.message ?? null,
      html: a.message ?? null,
      textContent: a.message ?? null,
      sourceUrl: a.html_url ?? null,
      url: a.html_url ?? null,
      createdAt: a.posted_at ?? null,
      updatedAt: a.delayed_post_at ?? a.posted_at ?? null,
      linkedFromModule: false,
      linkedFrom: null,
      metadata: {},
    });
  }

  for (const ce of calendarEvents) {
    items.push({
      id: `calendar_${ce.id}`,
      courseId: localCourseId,
      canvasCourseId,
      sourceType: "calendar_event",
      type: "calendar_event",
      title: ce.title,
      bodyText: ce.description ?? null,
      html: ce.description ?? null,
      textContent: ce.description ?? null,
      sourceUrl: ce.html_url ?? null,
      url: ce.html_url ?? null,
      createdAt: ce.start_at ?? null,
      updatedAt: ce.updated_at ?? ce.end_at ?? ce.start_at ?? null,
      dueAt: ce.start_at ?? null,
      dueDate: ce.start_at ?? null,
      linkedFromModule: false,
      linkedFrom: null,
      metadata: { contextCode: ce.context_code, endAt: ce.end_at },
    });
  }

  return items;
}
