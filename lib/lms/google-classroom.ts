/**
 * Google Classroom API integration
 *
 * OAuth scopes needed:
 *   - https://www.googleapis.com/auth/classroom.courses.readonly
 *   - https://www.googleapis.com/auth/classroom.coursework.me.readonly
 *   - https://www.googleapis.com/auth/classroom.student-submissions.me.readonly
 */

export interface GCCourse {
  id: string;
  name: string;
  section?: string;
  description?: string;
  teacherFolder?: { id: string };
  ownerId: string;
}

export interface GCCourseWork {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  dueDate?: { year: number; month: number; day: number };
  dueTime?: { hours: number; minutes: number };
  maxPoints?: number;
  workType: string;
  state: string;
  alternateLink: string;
}

export interface GCSubmission {
  id: string;
  courseId: string;
  courseWorkId: string;
  state: string;
  late?: boolean;
  assignedGrade?: number;
  submissionHistory?: Array<{ gradeHistory?: { maxPoints: number; pointsEarned: number } }>;
}

export async function fetchGCCourses(accessToken: string): Promise<GCCourse[]> {
  const res = await fetch(
    "https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=20",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Classroom courses error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.courses ?? [];
}

export async function fetchGCCourseWork(
  accessToken: string,
  courseId: string
): Promise<GCCourseWork[]> {
  let allWork: GCCourseWork[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork`);
    url.searchParams.set("pageSize", "50");
    url.searchParams.set("orderBy", "dueDate asc");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) break;

    const data = await res.json();
    allWork = allWork.concat(data.courseWork ?? []);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allWork;
}

export async function fetchGCSubmissions(
  accessToken: string,
  courseId: string,
  courseWorkId: string
): Promise<GCSubmission[]> {
  const res = await fetch(
    `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions?pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) return [];

  const data = await res.json();
  return data.studentSubmissions ?? [];
}

export function parseDueDate(
  dueDate?: { year: number; month: number; day: number },
  dueTime?: { hours: number; minutes: number }
): string | null {
  if (!dueDate) return null;
  const { year, month, day } = dueDate;
  const h = dueTime?.hours ?? 23;
  const m = dueTime?.minutes ?? 59;
  return new Date(year, month - 1, day, h, m).toISOString();
}

export function mapWorkType(workType: string): string {
  const map: Record<string, string> = {
    ASSIGNMENT: "homework",
    SHORT_ANSWER_QUESTION: "quiz",
    MULTIPLE_CHOICE_QUESTION: "quiz",
  };
  return map[workType] ?? "other";
}
