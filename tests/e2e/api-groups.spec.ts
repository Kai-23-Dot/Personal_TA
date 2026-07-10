/**
 * API-level integration tests for goal-bound groups (request fixture only —
 * no browser). Runs against the live Supabase project with the storageState
 * session from global-setup; every created group is prefixed `e2e-` and
 * deleted in afterAll.
 */
import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { E2E_PREFIX } from "./global-setup";

const runId = Date.now();
const createdGroupIds: string[] = [];

function futureDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: `${E2E_PREFIX}api-${runId}`,
    goal: "Finish the API test goal",
    targetEndDate: futureDate(14),
    meetings: [{ dayOfWeek: 1, startTime: "19:00", frequency: "weekly" }],
    ...overrides,
  };
}

test.describe("groups API", () => {
  test.afterAll(async ({ request }) => {
    for (const id of createdGroupIds) {
      await request.delete(`/api/groups/${id}`).catch(() => {});
    }
  });

  test("unauthenticated create is rejected", async ({ baseURL }) => {
    const anon: APIRequestContext = await pwRequest.newContext({ baseURL });
    const res = await anon.post("/api/groups", { data: validPayload() });
    expect([401, 307]).toContain(res.status()); // middleware may redirect API-less clients
    await anon.dispose();
  });

  const badPayloads: { label: string; body: Record<string, unknown>; fragment: string }[] = [
    { label: "missing name", body: validPayload({ name: undefined }), fragment: "name" },
    { label: "blank goal", body: validPayload({ goal: "  " }), fragment: "goal" },
    { label: "missing goal", body: validPayload({ goal: undefined }), fragment: "goal" },
    { label: "missing target date", body: validPayload({ targetEndDate: undefined }), fragment: "target end date" },
    { label: "malformed target date", body: validPayload({ targetEndDate: "01/08/2026" }), fragment: "YYYY-MM-DD" },
    { label: "past target date", body: validPayload({ targetEndDate: "2020-01-01" }), fragment: "future" },
    { label: "too-distant target date", body: validPayload({ targetEndDate: futureDate(900) }), fragment: "2 years" },
    { label: "empty meetings", body: validPayload({ meetings: [] }), fragment: "at least one" },
    { label: "missing meetings", body: validPayload({ meetings: undefined }), fragment: "meeting" },
    {
      label: "bad day of week",
      body: validPayload({ meetings: [{ dayOfWeek: 9, startTime: "19:00", frequency: "weekly" }] }),
      fragment: "between 0",
    },
    {
      label: "bad time format",
      body: validPayload({ meetings: [{ dayOfWeek: 1, startTime: "7pm", frequency: "weekly" }] }),
      fragment: "HH:MM",
    },
    {
      label: "bad frequency",
      body: validPayload({ meetings: [{ dayOfWeek: 1, startTime: "19:00", frequency: "daily" }] }),
      fragment: "weekly or biweekly",
    },
    {
      label: "duplicate slots",
      body: validPayload({
        meetings: [
          { dayOfWeek: 1, startTime: "19:00", frequency: "weekly" },
          { dayOfWeek: 1, startTime: "19:00", frequency: "biweekly" },
        ],
      }),
      fragment: "unique",
    },
  ];

  for (const { label, body, fragment } of badPayloads) {
    test(`create rejects ${label} with 400`, async ({ request }) => {
      const res = await request.post("/api/groups", { data: body });
      expect(res.status()).toBe(400);
      const { error } = await res.json();
      expect(error.toLowerCase()).toContain(fragment.toLowerCase());
    });
  }

  test("create → detail round-trips goal fields and meeting slots", async ({ request }) => {
    const res = await request.post("/api/groups", { data: validPayload() });
    expect(res.status()).toBe(200);
    const { group } = await res.json();
    createdGroupIds.push(group.id);

    expect(group.goal).toBe("Finish the API test goal");
    expect(group.target_end_date).toBe(futureDate(14));
    expect(group.progress_pct).toBe(0);
    expect(group.goal_completed_at).toBeNull();

    const detail = await request.get(`/api/groups/${group.id}`);
    expect(detail.ok()).toBeTruthy();
    const d = await detail.json();
    expect(d.meetings).toHaveLength(1);
    expect(d.meetings[0]).toMatchObject({ day_of_week: 1, frequency: "weekly" });
    expect(d.goalStatus).toBe("active");
    expect(["new", "scored"]).toContain(d.health.state);
    expect(d.checkedInToday).toBe(false);
  });

  test("check-in is idempotent and feeds health", async ({ request }) => {
    const created = await request.post("/api/groups", {
      data: validPayload({ name: `${E2E_PREFIX}checkin-${runId}` }),
    });
    const { group } = await created.json();
    createdGroupIds.push(group.id);

    const first = await request.post(`/api/groups/${group.id}/checkins`);
    expect(first.ok()).toBeTruthy();
    const a = await first.json();
    expect(a.alreadyCheckedIn).toBe(false);
    expect(a.streak).toBeGreaterThanOrEqual(1);
    expect(a.checkinsToday.length).toBe(1);

    const second = await request.post(`/api/groups/${group.id}/checkins`);
    expect(second.ok()).toBeTruthy();
    const b = await second.json();
    expect(b.alreadyCheckedIn).toBe(true);
    expect(b.health).toEqual(a.health); // no double-counting
    expect(b.checkinsToday.length).toBe(1);

    const detail = await request.get(`/api/groups/${group.id}`);
    const d = await detail.json();
    expect(d.checkedInToday).toBe(true);
  });

  test("owner PATCH updates progress and completes the goal idempotently", async ({ request }) => {
    const created = await request.post("/api/groups", {
      data: validPayload({ name: `${E2E_PREFIX}patch-${runId}` }),
    });
    const { group } = await created.json();
    createdGroupIds.push(group.id);

    const badProgress = await request.patch(`/api/groups/${group.id}`, {
      data: { progressPct: 250 },
    });
    expect(badProgress.status()).toBe(400);

    const progress = await request.patch(`/api/groups/${group.id}`, {
      data: { progressPct: 50 },
    });
    expect(progress.ok()).toBeTruthy();
    const p = await progress.json();
    expect(p.group.progress_pct).toBe(50);
    expect(p.group.goal_completed_at).toBeNull(); // progress alone never completes

    const complete = await request.patch(`/api/groups/${group.id}`, {
      data: { markComplete: true },
    });
    expect(complete.ok()).toBeTruthy();
    const c = await complete.json();
    expect(c.group.goal_completed_at).not.toBeNull();
    expect(c.goalStatus).toBe("completed");
    expect(c.health.state).toBe("completed");

    // Idempotent re-complete keeps the original timestamp.
    const again = await request.patch(`/api/groups/${group.id}`, {
      data: { markComplete: true },
    });
    const c2 = await again.json();
    expect(c2.group.goal_completed_at).toBe(c.group.goal_completed_at);
  });

  test("joining with your own invite code reports alreadyMember", async ({ request }) => {
    const created = await request.post("/api/groups", {
      data: validPayload({ name: `${E2E_PREFIX}join-${runId}` }),
    });
    const { group } = await created.json();
    createdGroupIds.push(group.id);

    const join = await request.post("/api/groups/join", {
      data: { inviteCode: group.invite_code },
    });
    expect(join.ok()).toBeTruthy();
    const j = await join.json();
    expect(j.alreadyMember).toBe(true);
  });

  test("stats endpoint returns the completion metric shape", async ({ request }) => {
    const res = await request.get("/api/groups/stats");
    expect(res.ok()).toBeTruthy();
    const stats = await res.json();
    for (const key of ["eligibleGroups", "completedGoals", "endedIncomplete", "activeGoals", "legacyGroups"]) {
      expect(typeof stats[key]).toBe("number");
    }
    expect(stats.eligibleGroups).toBe(stats.completedGoals + stats.endedIncomplete);
    if (stats.eligibleGroups === 0) {
      expect(stats.completionRate).toBeNull();
    } else {
      expect(stats.completionRate).toBeGreaterThanOrEqual(0);
      expect(stats.completionRate).toBeLessThanOrEqual(1);
    }
  });

  const second = process.env.E2E_EMAIL_2 && process.env.E2E_PASSWORD_2;
  test("non-owner PATCH is rejected with 403", async ({ request, baseURL }) => {
    test.skip(!second, "Set E2E_EMAIL_2 / E2E_PASSWORD_2 to enable the two-user test");

    const created = await request.post("/api/groups", {
      data: validPayload({ name: `${E2E_PREFIX}second-${runId}` }),
    });
    const { group } = await created.json();
    createdGroupIds.push(group.id);

    const other = await pwRequest.newContext({ baseURL });
    const login = await other.post("/api/auth/login", {
      data: { email: process.env.E2E_EMAIL_2, password: process.env.E2E_PASSWORD_2 },
    });
    expect(login.ok()).toBeTruthy();

    const join = await other.post("/api/groups/join", { data: { inviteCode: group.invite_code } });
    expect(join.ok()).toBeTruthy();

    const patch = await other.patch(`/api/groups/${group.id}`, { data: { markComplete: true } });
    expect(patch.status()).toBe(403);
    await other.dispose();
  });
});
