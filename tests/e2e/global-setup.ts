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

  const ctx = await request.newContext({ baseURL });

  const login = await ctx.post("/api/auth/login", { data: { email, password } });
  if (!login.ok()) {
    throw new Error(`E2E login failed (${login.status()}): ${await login.text()}`);
  }

  // Sweep stale e2e groups from crashed runs (owner delete cascades everything).
  const list = await ctx.get("/api/groups");
  if (list.ok()) {
    const { groups } = (await list.json()) as {
      groups: { id: string; name: string; my_role: string }[];
    };
    for (const g of groups ?? []) {
      if (g.name.startsWith(E2E_PREFIX) && g.my_role === "owner") {
        await ctx.delete(`/api/groups/${g.id}`);
      }
    }
  }

  mkdirSync("playwright/.auth", { recursive: true });
  await ctx.storageState({ path: STORAGE_STATE });
  await ctx.dispose();
}
