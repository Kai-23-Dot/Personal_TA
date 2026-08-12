import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertCanvasUrl,
  createCanvasOAuthState,
  normalizeCanvasDomain,
  verifyCanvasOAuthState,
} from "./canvas";

describe("Canvas URL and OAuth state hardening", () => {
  const originalAllowedDomains = process.env.CANVAS_ALLOWED_DOMAINS;
  const originalStateSecret = process.env.CANVAS_OAUTH_STATE_SECRET;

  beforeEach(() => {
    delete process.env.CANVAS_ALLOWED_DOMAINS;
    process.env.CANVAS_OAUTH_STATE_SECRET = "test-secret-at-least-long-enough";
  });

  afterEach(() => {
    process.env.CANVAS_ALLOWED_DOMAINS = originalAllowedDomains;
    process.env.CANVAS_OAUTH_STATE_SECRET = originalStateSecret;
  });

  it("normalizes safe Canvas hosts and rejects local or path-bearing inputs", () => {
    expect(normalizeCanvasDomain("School.Instructure.com")).toBe(
      "school.instructure.com"
    );
    expect(() => normalizeCanvasDomain("http://school.instructure.com")).toThrow();
    expect(() => normalizeCanvasDomain("https://127.0.0.1")).toThrow();
    expect(() => normalizeCanvasDomain("https://school.instructure.com/path")).toThrow();
  });

  it("requires custom OAuth hosts to be explicitly allowlisted", () => {
    expect(() =>
      normalizeCanvasDomain("canvas.example.edu", { forOAuth: true })
    ).toThrow(/allowlisted/);

    process.env.CANVAS_ALLOWED_DOMAINS = "canvas.example.edu";
    expect(
      normalizeCanvasDomain("canvas.example.edu", { forOAuth: true })
    ).toBe("canvas.example.edu");
  });

  it("rejects cross-origin pagination URLs", () => {
    expect(
      assertCanvasUrl(
        "https://school.instructure.com/api/v1/courses?page=2",
        "school.instructure.com"
      ).pathname
    ).toBe("/api/v1/courses");
    expect(() =>
      assertCanvasUrl(
        "https://attacker.example/api/v1/courses?page=2",
        "school.instructure.com"
      )
    ).toThrow(/cross-origin/);
  });

  it("binds signed OAuth state to the initiating browser nonce", () => {
    const created = createCanvasOAuthState("school.instructure.com");
    expect(
      verifyCanvasOAuthState(created.state, created.cookieNonce).domain
    ).toBe("school.instructure.com");
    expect(() =>
      verifyCanvasOAuthState(created.state, "different-browser")
    ).toThrow();
    expect(() =>
      verifyCanvasOAuthState(`${created.state}tampered`, created.cookieNonce)
    ).toThrow();
  });
});
