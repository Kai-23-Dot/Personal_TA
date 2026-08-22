import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/backend/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({
            data: [{ id: "11111111-1111-4111-8111-111111111111" }],
            error: null,
          }),
        })),
      })),
    })),
  })),
}));

import { POST } from "@/app/api/sync/all/route";

describe("sync all route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("forwards the authenticated request to the connection sync in quick mode", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      success: true, courses: 2, assignments: 59, notes: 0, errors: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const response = await POST(new NextRequest("http://localhost/api/sync/all?mode=quick", {
      method: "POST",
      headers: { cookie: "session=test-session" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, courses: 2, assignments: 59 });
    expect(mocks.fetch).toHaveBeenCalledWith(new URL("http://localhost/api/sync"), expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ cookie: "session=test-session" }),
      body: JSON.stringify({ connectionId: "11111111-1111-4111-8111-111111111111", mode: "quick" }),
    }));
  });

  it("returns a failure status and actionable error when no data can sync", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      success: false,
      courses: 0,
      assignments: 0,
      notes: 0,
      errors: ["Canvas authentication failed - token may be expired"],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const response = await POST(new NextRequest("http://localhost/api/sync/all?mode=quick", { method: "POST" }));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toMatchObject({
      success: false,
      error: "Canvas authentication failed - token may be expired",
    });
  });
});
