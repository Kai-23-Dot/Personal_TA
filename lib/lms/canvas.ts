/**
 * Canvas LMS REST API integration
 *
 * Canvas uses OAuth 2.0. Each school has its own domain (e.g. school.instructure.com).
 * Scopes: url:GET|/api/v1/courses, url:GET|/api/v1/courses/:course_id/assignments
 *
 * NOTE: Canvas Developer Keys must be requested through the school IT admin.
 */

export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  enrollment_term_id: number;
  teachers?: Array<{ display_name: string; login_id: string }>;
}

export interface CanvasAssignment {
  id: number;
  name: string;
  description?: string;
  due_at?: string;
  unlock_at?: string;
  points_possible?: number;
  submission_types: string[];
  html_url: string;
  has_submitted_submissions: boolean;
  grading_type: string;
}

export interface CanvasSubmission {
  id: number;
  assignment_id: number;
  submitted_at?: string;
  score?: number;
  grade?: string;
  late: boolean;
  body?: string;
}

export async function fetchCanvasCourses(
  domain: string,
  accessToken: string
): Promise<CanvasCourse[]> {
  const url = `https://${domain}/api/v1/courses?enrollment_state=active&include[]=teachers&per_page=50`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Canvas courses error ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

export async function fetchCanvasAssignments(
  domain: string,
  accessToken: string,
  courseId: number
): Promise<CanvasAssignment[]> {
  let allAssignments: CanvasAssignment[] = [];
  let page = 1;

  while (true) {
    const url = `https://${domain}/api/v1/courses/${courseId}/assignments?per_page=50&page=${page}&order_by=due_at`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) break;

    const data: CanvasAssignment[] = await res.json();
    if (data.length === 0) break;

    allAssignments = allAssignments.concat(data);
    page++;

    // Check Link header for next page
    const linkHeader = res.headers.get("Link");
    if (!linkHeader?.includes('rel="next"')) break;
  }

  return allAssignments;
}

export async function fetchCanvasSubmission(
  domain: string,
  accessToken: string,
  courseId: number,
  assignmentId: number
): Promise<CanvasSubmission | null> {
  const url = `https://${domain}/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/self`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return null;
  return res.json();
}

// Returned by GET /api/v1/courses/:courseId/students/submissions?student_ids[]=self
// Single call fetches ALL submissions for the student in a course.
export interface CanvasCourseSubmission {
  assignment_id: number;
  score: number | null;
  grade: string | null;
  submitted_at: string | null;
  workflow_state: "submitted" | "graded" | "unsubmitted" | "pending_review" | string;
  late: boolean;
  missing: boolean;
}

export async function fetchCanvasCourseSubmissions(
  domain: string,
  accessToken: string,
  courseId: number
): Promise<CanvasCourseSubmission[]> {
  const url = `https://${domain}/api/v1/courses/${courseId}/students/submissions?student_ids[]=self&per_page=100`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// Canvas Page (wiki page) — returned by GET /api/v1/courses/:id/pages
export interface CanvasPage {
  page_id: number;
  url: string; // URL slug, not full URL
  title: string;
  updated_at?: string;
}

// Full page detail including HTML body — GET /api/v1/courses/:id/pages/:url
export interface CanvasPageDetail extends CanvasPage {
  body?: string; // HTML content
}

export async function fetchCanvasPages(
  domain: string,
  accessToken: string,
  courseId: number
): Promise<CanvasPage[]> {
  const url = `https://${domain}/api/v1/courses/${courseId}/pages?per_page=50&sort=updated_at&order=desc`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchCanvasPageBody(
  domain: string,
  accessToken: string,
  courseId: number,
  pageSlug: string
): Promise<string | null> {
  const url = `https://${domain}/api/v1/courses/${courseId}/pages/${encodeURIComponent(pageSlug)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const page: CanvasPageDetail = await res.json();
    if (!page.body) return null;
    // Strip HTML tags → plain text
    return page.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  } catch {
    return null;
  }
}

/** Fetch full page detail (including page_id and raw HTML body) by URL slug. */
export async function fetchCanvasPageDetail(
  domain: string,
  accessToken: string,
  courseId: number,
  pageSlug: string
): Promise<CanvasPageDetail | null> {
  const url = `https://${domain}/api/v1/courses/${courseId}/pages/${encodeURIComponent(pageSlug)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Canvas Modules ────────────────────────────────────────────────────────────

export interface CanvasModule {
  id: number;
  name: string;
  position: number;
  items_count: number;
}

export interface CanvasModuleItem {
  id: number;
  module_id: number;
  title: string;
  position: number;
  /** "File" | "Page" | "Assignment" | "Quiz" | "ExternalUrl" | "ExternalTool" | "SubHeader" */
  type: string;
  /** URL slug — only present for type="Page" */
  page_url?: string;
  /** Numeric content ID — present for type="File", "Assignment", "Quiz" */
  content_id?: number;
  html_url?: string;
  /** Populated when the request includes include[]=content_details */
  content_details?: {
    "content-type"?: string;
    size?: number;
    /** Pre-signed download URL (for File items) */
    url?: string;
  };
}

/** Fetch all modules for a course (paginated). */
export async function fetchCanvasModules(
  domain: string,
  accessToken: string,
  courseId: number
): Promise<CanvasModule[]> {
  let allModules: CanvasModule[] = [];
  let page = 1;

  while (true) {
    const url = `https://${domain}/api/v1/courses/${courseId}/modules?per_page=50&page=${page}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) break;
      const data: CanvasModule[] = await res.json();
      if (data.length === 0) break;
      allModules = allModules.concat(data);
      page++;
      const linkHeader = res.headers.get("Link");
      if (!linkHeader?.includes('rel="next"')) break;
    } catch {
      break;
    }
  }

  return allModules;
}

/** Fetch all items in a module, requesting content_details for file download info. */
export async function fetchCanvasModuleItems(
  domain: string,
  accessToken: string,
  courseId: number,
  moduleId: number
): Promise<CanvasModuleItem[]> {
  const url =
    `https://${domain}/api/v1/courses/${courseId}/modules/${moduleId}/items` +
    `?per_page=50&include[]=content_details`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// Canvas File — returned by GET /api/v1/courses/:id/files
export interface CanvasFile {
  id: number;
  display_name: string;
  filename: string;
  "content-type": string;
  size: number;         // bytes
  url: string;         // pre-signed download URL (may require auth header)
  created_at: string;
  updated_at: string;
}

/**
 * Fetch course files from Canvas.
 * Limits to content types that can be extracted: PDF, DOCX, PPTX, TXT.
 * Canvas returns a pre-signed URL in `url` but it may redirect to S3/CDN — we
 * re-fetch with the auth header in the sync step to handle cross-origin redirects.
 */
export async function fetchCanvasFiles(
  domain: string,
  accessToken: string,
  courseId: number,
  maxFiles = 20
): Promise<CanvasFile[]> {
  const url =
    `https://${domain}/api/v1/courses/${courseId}/files` +
    `?per_page=${maxFiles}&sort=updated_at&order=desc` +
    `&content_types[]=application/pdf` +
    `&content_types[]=application/vnd.openxmlformats-officedocument.wordprocessingml.document` +
    `&content_types[]=application/vnd.openxmlformats-officedocument.presentationml.presentation` +
    `&content_types[]=text/plain`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const files: CanvasFile[] = await res.json();
    return files.slice(0, maxFiles);
  } catch {
    return [];
  }
}

export function mapCanvasAssignmentType(submissionTypes: string[]): string {
  if (submissionTypes.includes("online_quiz")) return "quiz";
  if (submissionTypes.includes("discussion_topic")) return "homework";
  if (submissionTypes.includes("media_recording")) return "lab";
  if (submissionTypes.length === 0 || submissionTypes.includes("none")) return "exam";
  return "homework";
}
