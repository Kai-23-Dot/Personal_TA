import { expect, test } from "@playwright/test";

const publicPages = [
  "/",
  "/about",
  "/contact",
  "/website",
  "/privacy",
  "/terms",
  "/login",
  "/signup",
  "/forgot-password",
];

const workspacePages = [
  "/dashboard",
  "/courses",
  "/assignments",
  "/notes",
  "/practice",
  "/flashcards",
  "/study",
  "/focus",
  "/review",
  "/chat",
  "/grades",
  "/groups",
  "/settings",
  "/pricing",
  "/teacher",
  "/admin",
];

const readOnlyApis = [
  "/api/assignments",
  "/api/billing/status",
  "/api/courses",
  "/api/flashcards/list",
  "/api/focus/history",
  "/api/groups",
  "/api/groups/stats",
  "/api/lms/connections",
  "/api/lms/status",
  "/api/notes/list",
  "/api/notifications",
  "/api/onboarding",
  "/api/performance/trends",
  "/api/performance/weak",
  `/api/planner/plan?date=${new Date().toISOString().slice(0, 10)}`,
  "/api/practice/history",
  "/api/profile",
  "/api/rubrics",
  "/api/study/availability",
  "/api/study/blocks",
  "/api/study/grade-impact",
  "/api/study/heatmap",
  "/api/study/priorities",
  "/api/study/recommendations",
  "/api/study/schedule",
  "/api/admin/overview?days=30",
];

test.describe("beta smoke coverage", () => {
  for (const path of publicPages) {
    test(`public page ${path} renders without an application failure`, async ({ browser, baseURL }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const response = await page.goto(`${baseURL}${path}`, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBeLessThan(400);
      await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/i);
      expect(pageErrors).toEqual([]);
      await context.close();
    });
  }

  for (const path of workspacePages) {
    test(`workspace page ${path} stays authenticated and renders`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBeLessThan(400);
      expect(new URL(page.url()).pathname).not.toBe("/login");
      await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/i);
      expect(pageErrors).toEqual([]);
    });
  }

  test("the workspace logo opens home without ending the session", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Return to the Smartlearn home page" }).first().click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("owner analytics reject signed-out visitors", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ storageState: undefined });
    const apiResponse = await context.request.get(`${baseURL}/api/admin/overview`);
    // Authentication middleware rejects anonymous API calls before the
    // route-level allowlist deliberately obscures non-owner accounts as 404.
    expect(apiResponse.status()).toBe(401);

    const page = await context.newPage();
    await page.goto(`${baseURL}/admin`);
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("workspace search navigates with the keyboard", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Control+K");
    const search = page.getByRole("search").getByLabel("Search workspace");
    await expect(search).toBeFocused();
    await search.fill("grades");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/grades$/);
  });

  test("public navigation is usable without horizontal overflow on mobile", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`${baseURL}/`);
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await expect(page.getByRole("link", { name: "Website" }).last()).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
    await context.close();
  });

  test("core workspace pages remain within the mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/dashboard", "/assignments", "/study", "/groups", "/settings"]) {
      await page.goto(path);
      await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content, `${path} overflows horizontally`).toBeLessThanOrEqual(dimensions.viewport + 1);
    }
  });

  for (const path of readOnlyApis) {
    test(`read-only API ${path} responds successfully`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status(), await response.text()).toBeLessThan(400);
    });
  }
});
