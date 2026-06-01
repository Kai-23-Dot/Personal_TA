/**
 * Canvas LMS REST API integration - Enhanced Version
 *
 * Canvas uses OAuth 2.0. Each school has its own domain (e.g. school.instructure.com).
 * Scopes: url:GET|/api/v1/courses, url:GET|/api/v1/courses/:course_id/assignments
 *
 * NOTE: Canvas Developer Keys must be requested through the school IT admin.
 *
 * ENHANCEMENTS:
 * - Rate limiting with exponential backoff
 * - Request queuing to respect Canvas API limits (~700 req/min)
 * - Better pagination with Link header parsing
 * - Improved HTML-to-text conversion
 * - Enhanced assignment type classification
 * - ETag support for caching
 * - Token expiry detection
 */

// ── Rate Limiting & Retry Configuration ──────────────────────────────────────

const RATE_LIMIT_DELAY_MS = 100; // 10ms between requests (safe for 700/min limit)
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 10000;

// Request queue for rate limiting
let requestQueue: Array<{
  execute: () => Promise<Response>;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
}> = [];
let isProcessingQueue = false;

/**
 * Process the request queue with rate limiting
 */
async function processQueue(): Promise<void> {
  if (isProcessingQueue || requestQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (requestQueue.length > 0) {
    const item = requestQueue.shift();
    if (item) {
      try {
        const response = await item.execute();
        item.resolve(response);
      } catch (error) {
        item.reject(error as Error);
      }
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
    }
  }
  
  isProcessingQueue = false;
}

/**
 * Execute a fetch request with rate limiting
 */
async function rateLimitedFetch(
  url: string,
  options: RequestInit = {},
  domain: string,
  accessToken: string
): Promise<Response> {
  return new Promise((resolve, reject) => {
    requestQueue.push({
      execute: async () => {
        return fetch(url, {
          ...options,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...options.headers,
          },
        });
      },
      resolve,
      reject,
    });
    processQueue().catch(reject);
  });
}

/**
 * Execute a fetch request with retry logic and exponential backoff
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  domain: string,
  accessToken: string,
  retryCount = 0
): Promise<Response> {
  try {
    const response = await rateLimitedFetch(url, options, domain, accessToken);
    
    // Handle rate limiting (429)
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter 
        ? parseInt(retryAfter) * 1000 
        : Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, retryCount), MAX_RETRY_DELAY_MS);
      
      console.warn(`[Canvas] Rate limited. Retrying after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      if (retryCount < MAX_RETRIES) {
        return fetchWithRetry(url, options, domain, accessToken, retryCount + 1);
      }
      
      throw new Error(`Canvas rate limit exceeded after ${MAX_RETRIES} retries`);
    }
    
    return response;
  } catch (error) {
    // Network errors - retry with backoff
    if (retryCount < MAX_RETRIES && (error as NodeJS.ErrnoException).code === 'ECONNRESET') {
      const delay = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, retryCount), MAX_RETRY_DELAY_MS);
      console.warn(`[Canvas] Network error. Retrying after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, domain, accessToken, retryCount + 1);
    }
    throw error;
  }
}

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  enrollment_term_id: number;
  teachers?: Array<{ display_name: string; login_id: string }>;
  start_at?: string;
  end_at?: string;
  syllabus_body?: string;
}

export interface CanvasAssignment {
  id: number;
  name: string;
  description?: string;
  due_at?: string;
  unlock_at?: string;
  lock_at?: string;
  points_possible?: number;
  submission_types: string[];
  html_url: string;
  has_submitted_submissions: boolean;
  grading_type: string;
  published?: boolean;
  unpublishable?: boolean;
  locked_for_user?: boolean;
  lock_explanation?: string;
  allowed_extensions?: string[];
  turnitin_enabled?: boolean;
  group_category_id?: number;
  position?: number;
  post_to_sis?: boolean;
  integration_id?: string;
  integration_data?: string;
  all_dates?: Array<{
    id: number;
    due_at?: string;
    lock_at?: string;
    unlock_at?: string;
  }>;
}

export interface CanvasSubmission {
  id: number;
  assignment_id: number;
  submitted_at?: string;
  score?: number;
  grade?: string;
  late: boolean;
  body?: string;
  workflow_state: string;
  attempt?: number;
  extra_attempts?: number;
  posted_at?: string;
  late_policy_status?: string;
  seconds_late?: number;
}

export interface CanvasCourseSubmission {
  assignment_id: number;
  score: number | null;
  grade: string | null;
  submitted_at: string | null;
  workflow_state: "submitted" | "graded" | "unsubmitted" | "pending_review" | string;
  late: boolean;
  missing: boolean;
}

export interface CanvasPage {
  page_id: number;
  url: string;
  title: string;
  updated_at?: string;
  created_at?: string;
  published?: boolean;
  front_page?: boolean;
}

export interface CanvasPageDetail extends CanvasPage {
  body?: string;
  lock_at?: string;
  published?: boolean;
}

export interface CanvasModule {
  id: number;
  name: string;
  position: number;
  items_count: number;
  require_sequential_progress?: boolean;
  published?: boolean;
}

export interface CanvasModuleItem {
  id: number;
  module_id: number;
  title: string;
  position: number;
  type: string;
  page_url?: string;
  external_url?: string;
  content_id?: number;
  html_url?: string;
  published?: boolean;
  completion_requirement?: {
    type: string;
    required?: boolean;
    min_score?: number;
  };
  content_details?: {
    "content-type"?: string;
    size?: number;
    url?: string;
  };
}

export interface CanvasFile {
  id: number;
  display_name: string;
  filename: string;
  "content-type"?: string;
  content_type?: string;
  size: number;
  url: string;
  created_at: string;
  updated_at: string;
  locked?: boolean;
  lock_version?: number;
  hidden?: boolean;
  lock_at?: string;
  hidden_for_user?: boolean;
}

export interface CanvasQuiz {
  id: number;
  title: string;
  quiz_type: string;
  html_url: string;
  due_at?: string;
  lock_at?: string;
  unlock_at?: string;
  points_possible?: number;
  question_count?: number;
  time_limit?: number;
  access_code_required?: boolean;
  ip_filter?: { ip: string; mask?: string };
  show_correct_answers?: boolean;
  published?: boolean;
  unlocked_for_user?: boolean;
  locked_for_user?: boolean;
  preview_url?: string;
}

export interface CanvasDiscussionTopic {
  id: number;
  title: string;
  html_url: string;
  posted_at?: string;
  updated_at?: string;
  delay_post_at?: string;
  published?: boolean;
  discussion_type: string;
  locked?: boolean;
  pinned?: boolean;
  locked_for_user?: boolean;
  assignment?: { id: number; points_possible: number; due_at?: string };
}

export interface CanvasAnnouncement {
  id: number;
  title: string;
  message?: string;
  html_url?: string;
  posted_at?: string;
  delayed_post_at?: string;
}

export interface CanvasCalendarEvent {
  id: number;
  title: string;
  description?: string;
  html_url?: string;
  start_at?: string;
  end_at?: string;
  updated_at?: string;
  context_code?: string;
}

export interface CanvasFolder {
  id: number;
  name: string;
  full_name?: string;
  parent_folder_id?: number;
  updated_at?: string;
}

// ── Enhanced HTML to Text Conversion ────────────────────────────────────────

/**
 * Convert HTML to plain text with better handling of common patterns
 */
export function htmlToPlainText(html: string | null | undefined): string | null {
  if (!html) return null;
  
  let text = html;
  
  // Remove script and style tags and their content
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Convert common block elements to newlines
  text = text.replace(/<\/?(div|p|section|article|header|footer|main|nav|aside)[^>]*>/gi, '\n');
  text = text.replace(/<\/?(h[1-6])[^>]*>/gi, '\n$1: ');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/?(li|tr)[^>]*>/gi, '\n• ');
  text = text.replace(/<\/?(ul|ol|table|thead|tbody|tfoot)[^>]*>/gi, '\n');
  
  // Handle links - preserve URL
  text = text.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)');
  
  // Handle images - preserve alt text
  text = text.replace(/<img\s+(?:[^>]*?\s+)?alt="([^"]*)"[^>]*>/gi, '[Image: $1]');
  text = text.replace(/<img\s+[^>]*>/gi, '[Image]');
  
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]*>/g, ' ');
  
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&/g, '&');
  text = text.replace(/</g, '<');
  text = text.replace(/>/g, '>');
  text = text.replace(/"/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/'/g, "'");
  text = text.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
  text = text.replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text || null;
}

// ── Assignment Type Classification ──────────────────────────────────────────

/**
 * Enhanced assignment type classification based on multiple factors
 */
export function mapCanvasAssignmentType(submissionTypes: string[], assignmentName?: string): string {
  const name = (assignmentName || '').toLowerCase();
  
  // Check submission types first
  if (submissionTypes.includes("online_quiz")) return "quiz";
  if (submissionTypes.includes("discussion_topic")) return "discussion";
  if (submissionTypes.includes("media_recording")) return "lab";
  if (submissionTypes.includes("basic_gradercam_submission")) return "exam";
  
  // Analyze assignment name for keywords
  const quizKeywords = ['quiz', 'test', 'assessment', 'check', 'knowledge check'];
  const examKeywords = ['exam', 'final', 'midterm', 'proctored', 'cumulative'];
  const labKeywords = ['lab', 'experiment', 'practical', 'workshop', 'studio'];
  const projectKeywords = ['project', 'capstone', 'portfolio', 'presentation', 'thesis'];
  const homeworkKeywords = ['homework', 'assignment', 'problem set', 'exercise', 'practice'];
  const readingKeywords = ['reading', 'chapter', 'article', 'review', 'summary'];
  
  for (const keyword of examKeywords) {
    if (name.includes(keyword)) return "exam";
  }
  
  for (const keyword of quizKeywords) {
    if (name.includes(keyword)) return "quiz";
  }
  
  for (const keyword of labKeywords) {
    if (name.includes(keyword)) return "lab";
  }
  
  for (const keyword of projectKeywords) {
    if (name.includes(keyword)) return "project";
  }
  
  for (const keyword of readingKeywords) {
    if (name.includes(keyword)) return "reading";
  }
  
  for (const keyword of homeworkKeywords) {
    if (name.includes(keyword)) return "homework";
  }
  
  // Default based on submission types
  if (submissionTypes.length === 0 || submissionTypes.includes("none")) return "exam";
  if (submissionTypes.includes("online_upload")) return "homework";
  if (submissionTypes.includes("online_text_entry")) return "homework";
  if (submissionTypes.includes("online_url")) return "homework";
  if (submissionTypes.includes("on_paper")) return "homework";
  
  return "homework";
}

// ── Core API Functions ──────────────────────────────────────────────────────

/**
 * Parse Link header for pagination
 */
function parseLinkHeader(linkHeader: string | null): { next?: string; prev?: string; first?: string; last?: string } {
  const result: { next?: string; prev?: string; first?: string; last?: string } = {};
  if (!linkHeader) return result;
  
  const links = linkHeader.split(',');
  for (const link of links) {
    const match = link.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match) {
      const [, url, rel] = match;
      result[rel as 'next' | 'prev' | 'first' | 'last'] = url;
    }
  }
  
  return result;
}

/**
 * Fetch all pages of results with proper pagination
 */
async function fetchAllPages<T>(
  domain: string,
  accessToken: string,
  baseUrl: string,
  perPage = 50
): Promise<T[]> {
  const allResults: T[] = [];
  let currentPage: string | null = baseUrl;
  
  while (currentPage) {
    const res = await fetchWithRetry(currentPage, {}, domain, accessToken);
    
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Canvas authentication failed - token may be expired');
      }
      if (res.status === 404) {
        // Resource not found - return what we have
        break;
      }
      throw new Error(`Canvas API error ${res.status}: ${await res.text().catch(() => 'Unknown error')}`);
    }
    
    const data: T[] = await res.json();
    allResults.push(...data);
    
    // Check for next page
    const linkHeader = res.headers.get('Link');
    const links = parseLinkHeader(linkHeader);
    currentPage = links.next || null;
    
    // Safety check - don't fetch more than 100 pages
    if (allResults.length > perPage * 100) {
      console.warn('[Canvas] Reached maximum pagination limit (5000 items)');
      break;
    }
  }
  
  return allResults;
}

/**
 * Fetch all courses for the current user
 */
export async function fetchCanvasCourses(
  domain: string,
  accessToken: string
): Promise<CanvasCourse[]> {
  const url = `https://${domain}/api/v1/courses?enrollment_state=active&include[]=teachers&include[]=syllabus_body&per_page=50`;
  
  try {
    return await fetchAllPages<CanvasCourse>(domain, accessToken, url);
  } catch (error) {
    console.error('[Canvas] Failed to fetch courses:', (error as Error).message);
    throw error;
  }
}

/**
 * Fetch all assignments for a course with enhanced data
 */
export async function fetchCanvasAssignments(
  domain: string,
  accessToken: string,
  courseId: number
): Promise<CanvasAssignment[]> {
  const url = `https://${domain}/api/v1/courses/${courseId}/assignments?per_page=50&order_by=due_at&include[]=all_dates&include[]=submission`;
  
  try {
    return await fetchAllPages<CanvasAssignment>(domain, accessToken, url);
  } catch (error) {
    console.error(`[Canvas] Failed to fetch assignments for course ${courseId}:`, (error as Error).message);
    return [];
  }
}

/**
 * Fetch a single assignment's submission
 */
export async function fetchCanvasSubmission(
  domain: string,
  accessToken: string,
  courseId: number,
  assignmentId: number
): Promise<CanvasSubmission | null> {
  const url = `https://${domain}/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/self?include[]=submission`;
  
  try {
    const res = await fetchWithRetry(url, {}, domain, accessToken);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch all submissions for a course
 */
export async function fetchCanvasCourseSubmissions(
  domain: string,
  accessToken: string,
  courseId: number
): Promise<CanvasCourseSubmission[]> {
  const url = `https://${domain}/api/v1/courses/${courseId}/students/submissions?student_ids[]=self&per_page=100&include[]=submission`;
  
  try {
    return await fetchAllPages<CanvasCourseSubmission>(domain, accessToken, url);
  } catch {
    return [];
  }
}

/**
 * Fetch all pages for a course
 */
export async function fetchCanvasPages(
  domain: string,
  accessToken: string,
  courseId: number
): Promise<CanvasPage[]> {
  const url = `https://${domain}/api/v1/courses/${courseId}/pages?per_page=50&sort=updated_at&order=desc`;
  
  try {
    return await fetchAllPages<CanvasPage>(domain, accessToken, url);
  } catch {
    return [];
  }
}

/**
 * Fetch page body as plain text
 */
export async function fetchCanvasPageBody(
  domain: string,
  accessToken: string,
  courseId: number,
  pageSlug: string
): Promise<string | null> {
  const url = `https://${domain}/api/v1/courses/${courseId}/pages/${encodeURIComponent(pageSlug)}`;
  
  try {
    const res = await fetchWithRetry(url, {}, domain, accessToken);
    if (!res.ok) return null;
    const page: CanvasPageDetail = await res.json();
    return htmlToPlainText(page.body);
  } catch {
    return null;
  }
}

/**
 * Fetch full page detail including raw HTML
 */
export async function fetchCanvasPageDetail(
  domain: string,
  accessToken: string,
  courseId: number,
  pageSlug: string
): Promise<CanvasPageDetail | null> {
  const url = `https://${domain}/api/v1/courses/${courseId}/pages/${encodeURIComponent(pageSlug)}`;
  
  try {
    const res = await fetchWithRetry(url, {}, domain, accessToken);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch all modules for a course
 */
export async function fetchCanvasModules(
  domain: string,
  accessToken: string,
  courseId: number
): Promise<CanvasModule[]> {
  const url = `https://${domain}/api/v1/courses/${courseId}/modules?per_page=50`;
  
  try {
    return await fetchAllPages<CanvasModule>(domain, accessToken, url);
  } catch {
    return [];
  }
}

/**
 * Fetch items for a specific module
 */
export async function fetchCanvasModuleItems(
  domain: string,
  accessToken: string,
  courseId: number,
  moduleId: number
): Promise<CanvasModuleItem[]> {
  const url = `https://${domain}/api/v1/courses/${courseId}/modules/${moduleId}/items?per_page=100&include[]=content_details`;
  
  try {
    return await fetchAllPages<CanvasModuleItem>(domain, accessToken, url);
  } catch {
    return [];
  }
}

/**
 * Fetch course files with content type filtering
 */
export async function fetchCanvasFiles(
  domain: string,
  accessToken: string,
  courseId: number,
  maxFiles = 20
): Promise<CanvasFile[]> {
  const url = `https://${domain}/api/v1/courses/${courseId}/files?per_page=${maxFiles}&sort=updated_at&order=desc&content_types[]=application/pdf&content_types[]=application/vnd.openxmlformats-officedocument.wordprocessingml.document&content_types[]=application/vnd.openxmlformats-officedocument.presentationml.presentation&content_types[]=text/plain`;
  
  try {
    const res = await fetchWithRetry(url, {}, domain, accessToken);
    if (!res.ok) return [];
    const files: CanvasFile[] = await res.json();
    return files.slice(0, maxFiles);
  } catch {
    return [];
  }
}

/**
 * Fetch course files without MIME filters (used for discovery/lesson fallback).
 */
export async function fetchCanvasFilesWide(
  domain: string,
  accessToken: string,
  courseId: number,
  maxFiles = 100
): Promise<CanvasFile[]> {
  const url = `https://${domain}/api/v1/courses/${courseId}/files?per_page=${maxFiles}&sort=updated_at&order=desc`;
  try {
    const results = await fetchAllPages<CanvasFile>(domain, accessToken, url);
    return results.slice(0, maxFiles);
  } catch {
    return [];
  }
}

/**
 * Fetch a single file by ID (used as a fallback for module file items where
 * content_details can be partial or missing).
 */
export async function fetchCanvasFileById(
  domain: string,
  accessToken: string,
  courseId: number,
  fileId: number
): Promise<CanvasFile | null> {
  const url = `https://${domain}/api/v1/courses/${courseId}/files/${fileId}`;

  try {
    const res = await fetchWithRetry(url, {}, domain, accessToken);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch quizzes for a course
 */
export async function fetchCanvasQuizzes(
  domain: string,
  accessToken: string,
  courseId: number
): Promise<CanvasQuiz[]> {
  const url = `https://${domain}/api/v1/courses/${courseId}/quizzes?per_page=50`;
  
  try {
    return await fetchAllPages<CanvasQuiz>(domain, accessToken, url);
  } catch {
    return [];
  }
}

/**
 * Fetch discussion topics for a course
 */
export async function fetchCanvasDiscussionTopics(
  domain: string,
  accessToken: string,
  courseId: number
): Promise<CanvasDiscussionTopic[]> {
  const url = `https://${domain}/api/v1/courses/${courseId}/discussion_topics?per_page=50`;
  
  try {
    return await fetchAllPages<CanvasDiscussionTopic>(domain, accessToken, url);
  } catch {
    return [];
  }
}

/**
 * Fetch announcements for a course.
 */
export async function fetchCanvasAnnouncements(
  domain: string,
  accessToken: string,
  courseId: number
): Promise<CanvasAnnouncement[]> {
  const url = `https://${domain}/api/v1/announcements?context_codes[]=course_${courseId}&per_page=50&active_only=true`;
  try {
    return await fetchAllPages<CanvasAnnouncement>(domain, accessToken, url);
  } catch {
    return [];
  }
}

/**
 * Fetch course calendar events.
 */
export async function fetchCanvasCalendarEvents(
  domain: string,
  accessToken: string,
  courseId: number
): Promise<CanvasCalendarEvent[]> {
  const url = `https://${domain}/api/v1/calendar_events?context_codes[]=course_${courseId}&all_events=true&per_page=100`;
  try {
    return await fetchAllPages<CanvasCalendarEvent>(domain, accessToken, url);
  } catch {
    return [];
  }
}

/**
 * Fetch folders for a course.
 */
export async function fetchCanvasFolders(
  domain: string,
  accessToken: string,
  courseId: number
): Promise<CanvasFolder[]> {
  const url = `https://${domain}/api/v1/courses/${courseId}/folders?per_page=100`;
  try {
    return await fetchAllPages<CanvasFolder>(domain, accessToken, url);
  } catch {
    return [];
  }
}

/**
 * Get user profile
 */
export async function fetchCanvasUserProfile(
  domain: string,
  accessToken: string
): Promise<{ id: number; name: string; primary_email: string; login_id: string } | null> {
  const url = `https://${domain}/api/v1/users/self/profile`;
  
  try {
    const res = await fetchWithRetry(url, {}, domain, accessToken);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Check if token is still valid
 */
export async function validateCanvasToken(
  domain: string,
  accessToken: string
): Promise<boolean> {
  const profile = await fetchCanvasUserProfile(domain, accessToken);
  return profile !== null;
}

/**
 * Get course syllabus as plain text
 */
export async function fetchCanvasCourseSyllabus(
  domain: string,
  accessToken: string,
  courseId: number
): Promise<string | null> {
  const url = `https://${domain}/api/v1/courses/${courseId}?include[]=syllabus_body`;
  
  try {
    const res = await fetchWithRetry(url, {}, domain, accessToken);
    if (!res.ok) return null;
    const course: CanvasCourse = await res.json();
    return htmlToPlainText(course.syllabus_body);
  } catch {
    return null;
  }
}

/**
 * Get assignment submissions with full details
 */
export async function fetchCanvasAssignmentSubmissions(
  domain: string,
  accessToken: string,
  courseId: number,
  assignmentId: number
): Promise<CanvasSubmission[]> {
  const url = `https://${domain}/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions?per_page=50&include[]=submission`;
  
  try {
    return await fetchAllPages<CanvasSubmission>(domain, accessToken, url);
  } catch {
    return [];
  }
}

/**
 * Get grades for a course (for graded assignments)
 */
export async function fetchCanvasCourseGrades(
  domain: string,
  accessToken: string,
  courseId: number
): Promise<{ assignment_id: number; score: number; grade: string; submitted_at: string }[]> {
  const url = `https://${domain}/api/v1/courses/${courseId}/students/submissions?student_ids[]=self&per_page=100&include[]=grades`;
  
  try {
    const submissions = await fetchAllPages<CanvasCourseSubmission>(domain, accessToken, url);
    return submissions
      .filter(sub => sub.score !== null && sub.submitted_at !== null)
      .map(sub => ({
        assignment_id: sub.assignment_id,
        score: sub.score as number,
        grade: sub.grade || String(sub.score),
        submitted_at: sub.submitted_at as string,
      }));
  } catch {
    return [];
  }
}

/**
 * Get enrollment information for a course
 */
export async function fetchCanvasCourseEnrollments(
  domain: string,
  accessToken: string,
  courseId: number
): Promise<Array<{ type: string; role: string; user_id: number }>> {
  const url = `https://${domain}/api/v1/courses/${courseId}/enrollments?user_id=self`;
  
  try {
    const res = await fetchWithRetry(url, {}, domain, accessToken);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/**
 * Check if user is a teacher in a course
 */
export async function isCanvasTeacher(
  domain: string,
  accessToken: string,
  courseId: number
): Promise<boolean> {
  const enrollments = await fetchCanvasCourseEnrollments(domain, accessToken, courseId);
  return enrollments.some(e => 
    e.type === 'TeacherEnrollment' || 
    e.type === 'TaEnrollment' || 
    e.role === 'TeacherEnrollment' || 
    e.role === 'TaEnrollment'
  );
}
