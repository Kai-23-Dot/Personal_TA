import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  fetchCanvasUserProfile: vi.fn(),
  getUser: vi.fn(),
  insertSingle: vi.fn(),
  maybeSingle: vi.fn(),
  updateEq: vi.fn(),
}));

vi.mock("@/backend/lms/canvas", () => ({
  fetchCanvasUserProfile: mocks.fetchCanvasUserProfile,
}));

vi.mock("@/backend/supabase/server", () => ({
  createClient: vi.fn(async () => {
    const lookup = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mocks.maybeSingle,
    };
    const updateQuery = {
      eq: (...args: unknown[]) => {
        mocks.updateEq(...args);
        return updateQuery;
      },
    };
    return {
      auth: { getUser: mocks.getUser },
      from: vi.fn(() => ({
        select: vi.fn(() => lookup),
        update: vi.fn(() => updateQuery),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({ single: mocks.insertSingle })),
        })),
      })),
    };
  }),
}));

import { PATCH, POST } from "@/app/api/lms/canvas/route";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/lms/canvas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Canvas personal-token connection route", () => {
  const originalAllowedDomains = process.env.CANVAS_ALLOWED_DOMAINS;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.insertSingle.mockResolvedValue({ data: { id: "connection-1" }, error: null });
    mocks.fetchCanvasUserProfile.mockResolvedValue({
      id: 42,
      name: "Canvas Student",
      login_id: "student@example.edu",
      primary_email: "student@example.edu",
    });
    delete process.env.CANVAS_ALLOWED_DOMAINS;
  });

  afterEach(() => {
    if (originalAllowedDomains === undefined) {
      delete process.env.CANVAS_ALLOWED_DOMAINS;
    } else {
      process.env.CANVAS_ALLOWED_DOMAINS = originalAllowedDomains;
    }
  });

  it("requires an authenticated Smartlearn account", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(request({ domain: "school.instructure.com", access_token: "secret" }));
    expect(response.status).toBe(401);
  });

  it("rejects unsafe Canvas hosts before sending a token", async () => {
    const response = await POST(request({ domain: "http://127.0.0.1", access_token: "secret" }));
    expect(response.status).toBe(400);
    expect(mocks.fetchCanvasUserProfile).not.toHaveBeenCalled();
  });

  it("rejects a custom Canvas domain that the administrator has not allowlisted", async () => {
    const response = await POST(request({ domain: "canvas.example.edu", access_token: "secret" }));
    expect(response.status).toBe(400);
    expect(mocks.fetchCanvasUserProfile).not.toHaveBeenCalled();
  });

  it("accepts a valid personal token on an allowlisted custom Canvas domain", async () => {
    process.env.CANVAS_ALLOWED_DOMAINS = "canvas.example.edu";
    const response = await POST(request({ domain: "canvas.example.edu", access_token: "secret" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      agreementRequired: true,
      agreementVersion: "2026-08-22",
      connectionId: "connection-1",
    });
    expect(mocks.fetchCanvasUserProfile).toHaveBeenCalledWith("canvas.example.edu", "secret");
  });

  it("returns a useful retry message when Canvas rejects the token", async () => {
    mocks.fetchCanvasUserProfile.mockResolvedValue(null);
    const response = await POST(request({ domain: "school.instructure.com", access_token: "expired" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/entire token.*expired/i) });
  });

  it("reactivates an existing connection instead of creating a duplicate", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: "existing-connection" }, error: null });
    const response = await POST(request({ domain: "school.instructure.com", access_token: "replacement" }));
    await expect(response.json()).resolves.toEqual({
      success: true,
      agreementRequired: true,
      agreementVersion: "2026-08-22",
      connectionId: "existing-connection",
    });
    expect(mocks.updateEq).toHaveBeenCalledWith("id", "existing-connection");
    expect(mocks.insertSingle).not.toHaveBeenCalled();
  });

  it("activates a validated personal-token connection after explicit agreement", async () => {
    const connectionId = "11111111-1111-4111-8111-111111111111";
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: connectionId,
        metadata: {
          canvas_connection_agreement: {
            connection_method: "personal_access_token",
            status: "pending",
            version: "2026-08-22",
          },
        },
        scopes: ["personal_access_token"],
      },
      error: null,
    });

    const response = await PATCH(request({ accepted: true, connectionId }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      agreementVersion: "2026-08-22",
      connectionId,
    });
    expect(mocks.updateEq).toHaveBeenCalledWith("id", connectionId);
    expect(mocks.updateEq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("does not activate a Canvas connection without explicit agreement", async () => {
    const response = await PATCH(request({
      accepted: false,
      connectionId: "11111111-1111-4111-8111-111111111111",
    }));
    expect(response.status).toBe(400);
    expect(mocks.updateEq).not.toHaveBeenCalled();
  });
});
