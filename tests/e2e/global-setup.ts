/**
 * Playwright global setup:
 *  1. Logs in via POST /api/auth/login (credentials from .env.test) and saves
 *     the session cookies as storageState for every test.
 *  2. Sweeps stale `e2e-` groups owned by the test account left behind by
 *     crashed prior runs, so the live database stays clean.
 */
import { mkdirSync } from "node:fs";
import { request, type FullConfig } from "@playwright/test";

export const E2E_PREFIX = "e2e-";
export const STORAGE_STATE = "playwright/.auth/user.json";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3100";
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "E2E_EMAIL and E2E_PASSWORD must be set (copy .env.test.example to .env.test)."
    );
  }

  const ctx = await request.newContext({ baseURL, timeout: 90_000 });

  // Supabase authentication can take longer than Playwright's 30 second
  // request default after a cold local start. Keep setup tolerant without
  // weakening any individual interaction assertion.
  const login = await ctx.post("/api/auth/login", {
    data: { email, password },
    timeout: 90_000,
  });
  if (!login.ok()) {
    throw new Error(`E2E login failed (${login.status()}): ${await login.text()}`);
  }

  mkdirSync("playwright/.auth", { recursive: true });
  await ctx.storageState({ path: STORAGE_STATE });

  // Cleanup is best effort: a slow live database must not prevent otherwise
  // read-only browser coverage from starting with a valid authenticated state.
  try {
    const list = await ctx.get("/api/groups", { timeout: 15_000 });
    if (list.ok()) {
      const { groups } = (await list.json()) as {
        groups: { id: string; name: string; my_role: string }[];
      };
      for (const g of groups ?? []) {
        if (g.name.startsWith(E2E_PREFIX) && g.my_role === "owner") {
          await ctx.delete(`/api/groups/${g.id}`, { timeout: 15_000 });
        }
      }
    }
  } catch {
    console.warn("[e2e] Skipped stale group cleanup because the live API was unavailable.");
  }
  await ctx.dispose();
}
