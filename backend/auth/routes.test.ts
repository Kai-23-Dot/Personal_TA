import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/app/api/auth/_supabase-route", () => ({
  createAuthRouteClient: vi.fn(() => ({
    supabase: {
      auth: {
        signInWithPassword: mocks.signInWithPassword,
        signOut: mocks.signOut,
        signUp: mocks.signUp,
      },
      rpc: mocks.rpc,
    },
    applyCookies: (response: NextResponse) => response,
  })),
  authUnavailableResponse: vi.fn(() =>
    NextResponse.json({ error: "Unavailable" }, { status: 503 })
  ),
}));

import { POST as login } from "@/app/api/auth/login/route";
import { POST as signup } from "@/app/api/auth/signup/route";

function jsonRequest(path: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("auth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { email_confirmed_at: "2026-08-22T12:00:00.000Z" } },
      error: null,
    });
    mocks.signUp.mockResolvedValue({
      data: { session: null, user: { email_confirmed_at: null } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  it("allows login when an older client sends a null CAPTCHA token", async () => {
    const response = await login(
      jsonRequest("/api/auth/login", {
        email: "student@example.com",
        password: "correct-password",
        captchaToken: null,
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "student@example.com",
      password: "correct-password",
      options: { captchaToken: undefined },
    });
  });

  it("allows signup when an older client sends a null CAPTCHA token", async () => {
    const response = await signup(
      jsonRequest("/api/auth/signup", {
        username: "Student",
        email: "student@example.com",
        password: "correct-password",
        captchaToken: null,
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "student@example.com",
      password: "correct-password",
      options: {
        data: { full_name: "Student", username: "Student" },
        captchaToken: undefined,
        emailRedirectTo: "http://localhost/callback?next=%2Fonboarding%3Fwelcome%3D1",
      },
    });
    expect(mocks.rpc).toHaveBeenCalledWith("is_username_available", {
      candidate_username: "Student",
    });
  });

  it("rejects a login when the provider returns an unverified user", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: { user: { email_confirmed_at: null } },
      error: null,
    });

    const response = await login(
      jsonRequest("/api/auth/login", {
        email: "student@example.com",
        password: "correct-password",
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    await expect(response.json()).resolves.toMatchObject({
      code: "EMAIL_NOT_VERIFIED",
    });
  });

  it("fails closed if signup unexpectedly returns an active session", async () => {
    mocks.signUp.mockResolvedValueOnce({
      data: {
        session: { access_token: "unexpected" },
        user: { email_confirmed_at: "2026-08-22T12:00:00.000Z" },
      },
      error: null,
    });

    const response = await signup(
      jsonRequest("/api/auth/signup", {
        username: "Student",
        email: "student@example.com",
        password: "correct-password",
      })
    );

    expect(response.status).toBe(503);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("rejects signup before creating an auth user when the username exists", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });

    const response = await signup(
      jsonRequest("/api/auth/signup", {
        username: "student",
        email: "another@example.com",
        password: "correct-password",
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "That username is already taken. Please choose another one.",
      code: "USERNAME_TAKEN",
    });
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("fails closed when username uniqueness cannot be verified", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "RPC unavailable" },
    });

    const response = await signup(
      jsonRequest("/api/auth/signup", {
        username: "Student",
        email: "student@example.com",
        password: "correct-password",
      })
    );

    expect(response.status).toBe(503);
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("returns a username conflict if the database wins a concurrent signup race", async () => {
    mocks.signUp.mockResolvedValueOnce({
      data: { session: null },
      error: { message: "duplicate username violates unique constraint" },
    });

    const response = await signup(
      jsonRequest("/api/auth/signup", {
        username: "Student",
        email: "student@example.com",
        password: "correct-password",
      })
    );

    expect(response.status).toBe(409);
    expect(mocks.signUp).toHaveBeenCalledTimes(1);
  });
});
