/**
 * Microsoft Graph Education API integration
 *
 * OAuth scopes:
 *   - EduAssignments.ReadBasic
 *   - EduRoster.ReadBasic
 *   - Calendars.Read
 *   - offline_access
 *
 * Register app at https://portal.azure.com — Azure Active Directory > App registrations
 */

export interface MSClass {
  id: string;
  displayName: string;
  description?: string;
  mailNickname: string;
  teachers?: Array<{ displayName: string; mail: string }>;
}

export interface MSAssignment {
  id: string;
  displayName: string;
  instructions?: { content?: string };
  dueDateTime?: string;
  assignedDateTime?: string;
  status: string;
  allowLateSubmissions: boolean;
  grading?: { maxPoints: number };
  classId: string;
}

export interface MSSubmission {
  id: string;
  status: string;
  submittedDateTime?: string;
  outcome?: {
    publishedPoints?: { points: number };
    publishedRubricQualityFeedback?: { comment?: { content?: string } };
  };
}

export interface MSCalendarEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  body?: { content?: string };
}

export async function fetchMSClasses(accessToken: string): Promise<MSClass[]> {
  const res = await fetch(
    "https://graph.microsoft.com/v1.0/education/me/classes?$select=id,displayName,description,mailNickname",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) throw new Error(`MS Graph classes error ${res.status}`);

  const data = await res.json();
  return data.value ?? [];
}

export async function fetchMSAssignments(
  accessToken: string,
  classId: string
): Promise<MSAssignment[]> {
  let allAssignments: MSAssignment[] = [];
  let url:
    | string
    | null = `https://graph.microsoft.com/v1.0/education/classes/${classId}/assignments?$top=50`;

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) break;

    const data: { value?: MSAssignment[]; "@odata.nextLink"?: string } = await res.json();
    allAssignments = allAssignments.concat(data.value ?? []);
    url = data["@odata.nextLink"] ?? null;
  }

  return allAssignments;
}

export async function fetchMSSubmission(
  accessToken: string,
  classId: string,
  assignmentId: string
): Promise<MSSubmission | null> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/education/classes/${classId}/assignments/${assignmentId}/submissions?$filter=submittedBy/user/id eq 'me'`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) return null;

  const data = await res.json();
  return data.value?.[0] ?? null;
}

export async function fetchMSCalendarEvents(
  accessToken: string,
  startDateTime: string,
  endDateTime: string
): Promise<MSCalendarEvent[]> {
  const url = new URL("https://graph.microsoft.com/v1.0/me/calendar/calendarView");
  url.searchParams.set("startDateTime", startDateTime);
  url.searchParams.set("endDateTime", endDateTime);
  url.searchParams.set("$top", "50");
  url.searchParams.set("$select", "id,subject,start,end,body");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return [];

  const data = await res.json();
  return data.value ?? [];
}
