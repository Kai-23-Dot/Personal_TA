import { defineConfig } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// E2E credentials live in .env.test (gitignored — see .env.test.example).
loadEnv({ path: ".env.test" });

const PORT = 3100;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  // These tests hit the live Supabase project — run serially so cleanup and
  // creation never race each other.
  workers: 1,
  use: {
    baseURL: BASE_URL,
    storageState: "playwright/.auth/user.json",
    trace: "retain-on-failure",
  },
  webServer: {
    // Plain `next dev` on a fixed port — scripts/dev-server.mjs hunts for a
    // free port, which would break the fixed baseURL. NEXT_DIST_DIR matches
    // the dev script so build artifacts stay out of `.next`.
    command: `npx next dev --port ${PORT}`,
    url: BASE_URL,
    env: { NEXT_DIST_DIR: ".next-dev" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
