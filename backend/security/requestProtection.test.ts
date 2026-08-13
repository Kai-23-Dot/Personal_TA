import { afterEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimitsForTests } from "./requestProtection";

describe("checkRateLimit", () => {
  afterEach(() => resetRateLimitsForTests());

  it("allows requests through the configured limit", () => {
    expect(checkRateLimit("ip:one", { limit: 2, windowMs: 1_000 }, 100).allowed).toBe(true);
    const second = checkRateLimit("ip:one", { limit: 2, windowMs: 1_000 }, 200);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
  });

  it("blocks requests above the limit and reports a retry time", () => {
    checkRateLimit("ip:one", { limit: 1, windowMs: 1_000 }, 100);
    const blocked = checkRateLimit("ip:one", { limit: 1, windowMs: 1_000 }, 200);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
  });

  it("starts a fresh bucket after the window expires", () => {
    checkRateLimit("ip:one", { limit: 1, windowMs: 1_000 }, 100);
    expect(checkRateLimit("ip:one", { limit: 1, windowMs: 1_000 }, 1_100).allowed).toBe(true);
  });

  it("isolates different keys", () => {
    checkRateLimit("ip:one", { limit: 1, windowMs: 1_000 }, 100);
    expect(checkRateLimit("ip:two", { limit: 1, windowMs: 1_000 }, 100).allowed).toBe(true);
  });
});
