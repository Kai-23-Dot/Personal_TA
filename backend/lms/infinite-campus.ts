/**
 * Infinite Campus REST API integration
 *
 * Infinite Campus (IC) is a K-12 SIS/LMS used by many US school districts.
 * Each district has its own domain (e.g. mydistrict.infinitecampus.org/campus).
 *
 * Auth: OAuth 2.0 or a Personal Access Token generated in the IC Student Portal.
 * OAuth requires a district-configured OAuth application (done by IT admin).
 *
 * Key API paths (relative to https://{domain}/campus):
 *   GET /api/portal/students/me           → student profile
 *   GET /api/portal/students/{id}/sections → enrolled courses
 *   GET /api/portal/students/{id}/assignments?sectionID={id} → per-section assignments
 *   GET /api/portal/students/{id}/grades   → overall course grades
 *
 * Note: exact paths vary by district IC version. The adapter tries the v1 paths
 * and falls back silently so other data still syncs if one endpoint is unavailable.
 */

export interface ICStudent {
  personID: number;
  firstName: string;
  lastName: string;
  email?: string;
  studentNumber?: string;
}

export interface ICSection {
  sectionID: number;
  courseID: number;
  courseName: string;
  courseNumber?: string;
  sectionNumber?: string;
  teacherDisplay?: string;
  teacherEmail?: string;
  termName?: string;
  // v2 alias shapes — different IC versions use different keys
  name?: string;
  displayName?: string;
}

export interface ICAssignment {
  assignmentID: number;
  assignmentName: string;
  dueDate?: string;       // ISO date string
  assignedDate?: string;
  totalPoints?: number;
  score?: number | null;
  scoreString?: string;   // e.g. "95", "A", "Pass"
  missing?: boolean;
  turned_in?: boolean;
  type?: string;          // "homework", "quiz", etc.
  sectionID?: number;
  url?: string;
}

export interface ICGrade {
  sectionID: number;
  courseName: string;
  termName?: string;
  grade?: string;         // letter grade
  percent?: number;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function icBase(domain: string) {
  // Normalize: accept "district.infinitecampus.org/campus" or "district.infinitecampus.org"
  const d = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  // If the domain already ends with /campus, use it; otherwise append
  return d.endsWith("/campus") ? `https://${d}` : `https://${d}/campus`;
}

async function icGet<T>(
  domain: string,
  accessToken: string,
  path: string
): Promise<T | null> {
  const url = `${icBase(domain)}${path}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// ── public API ────────────────────────────────────────────────────────────────

export async function fetchICProfile(
  domain: string,
  accessToken: string
): Promise<ICStudent | null> {
  return icGet<ICStudent>(domain, accessToken, "/api/portal/students/me");
}

export async function fetchICSections(
  domain: string,
  accessToken: string,
  studentId: number
): Promise<ICSection[]> {
  // Try both known path shapes
  const v1 = await icGet<ICSection[]>(
    domain,
    accessToken,
    `/api/portal/students/${studentId}/sections`
  );
  if (v1 && Array.isArray(v1) && v1.length > 0) return v1;

  const v2 = await icGet<{ sections?: ICSection[] }>(
    domain,
    accessToken,
    `/api/v1/portal/students/${studentId}/sections`
  );
  return v2?.sections ?? [];
}

export async function fetchICAssignments(
  domain: string,
  accessToken: string,
  studentId: number,
  sectionId: number
): Promise<ICAssignment[]> {
  const result = await icGet<ICAssignment[]>(
    domain,
    accessToken,
    `/api/portal/students/${studentId}/assignments?sectionID=${sectionId}`
  );
  return result ?? [];
}

export async function fetchICGrades(
  domain: string,
  accessToken: string,
  studentId: number
): Promise<ICGrade[]> {
  const result = await icGet<ICGrade[]>(
    domain,
    accessToken,
    `/api/portal/students/${studentId}/grades`
  );
  return result ?? [];
}

export function mapICAssignmentType(type?: string): string {
  if (!type) return "homework";
  const t = type.toLowerCase();
  if (t.includes("quiz")) return "quiz";
  if (t.includes("test") || t.includes("exam")) return "exam";
  if (t.includes("project")) return "project";
  if (t.includes("lab")) return "lab";
  if (t.includes("essay")) return "essay";
  return "homework";
}
