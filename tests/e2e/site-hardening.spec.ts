import { expect, test, type Page } from "@playwright/test";

const publicPages = ["/", "/about", "/contact", "/privacy", "/terms", "/login", "/signup"];
const coreWorkspacePages = [
  "/dashboard",
  "/courses",
  "/assignments",
  "/notes",
  "/practice",
  "/flashcards",
  "/review",
  "/focus",
  "/grades",
  "/groups",
  "/settings",
];

async function expectHealthyDocument(page: Page, path: string) {
  const pageErrors: string[] = [];
  const brokenResources: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    const resourceType = response.request().resourceType();
    const sameOrigin = new URL(response.url()).origin === new URL(page.url()).origin;
    if (sameOrigin && ["document", "stylesheet", "script", "image", "font"].includes(resourceType) && response.status() >= 400) {
      brokenResources.push(`${response.status()} ${response.url()}`);
    }
  });

  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `${path} returned an error`).toBeLessThan(400);
  await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/i);
  await expect(page.locator("main").first()).toBeVisible();
  expect(pageErrors, `${path} raised browser errors`).toEqual([]);
  expect(brokenResources, `${path} loaded broken resources`).toEqual([]);
}

test.describe("hardening: public website", () => {
  for (const path of publicPages) {
    test(`${path} is healthy at desktop and mobile widths`, async ({ browser, baseURL }) => {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        await expectHealthyDocument(page, `${baseURL}${path}`);
        const dimensions = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
        }));
        expect(dimensions.content, `${path} overflows at ${viewport.width}px`).toBeLessThanOrEqual(dimensions.viewport + 1);
        await context.close();
      }
    });
  }

  test("public navigation contains no broken internal destinations", async ({ browser, baseURL }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" });
    const hrefs = await page.locator("a[href]").evaluateAll((links) =>
      Array.from(new Set(links.map((link) => (link as HTMLAnchorElement).href)))
    );
    for (const href of hrefs) {
      const url = new URL(href);
      if (url.origin !== new URL(baseURL!).origin || url.pathname === "/logout") continue;
      const response = await context.request.get(url.toString(), { maxRedirects: 5 });
      expect(response.status(), `${url.pathname} is broken`).toBeLessThan(400);
    }
    await context.close();
  });
});

test.describe("hardening: authentication boundary", () => {
  for (const path of coreWorkspacePages) {
    test(`signed-out visitors cannot open ${path}`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ storageState: undefined });
      const page = await context.newPage();
      await page.goto(`${baseURL}${path}`, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/login(?:\?|$)/);
      await context.close();
    });
  }

  test("signed-out API requests are rejected without leaking data", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ storageState: undefined });
    for (const path of [
      "/api/assignments",
      "/api/courses",
      "/api/notes/list",
      "/api/profile",
      "/api/study/recommendations",
      "/api/admin/overview",
    ]) {
      const response = await context.request.get(`${baseURL}${path}`);
      expect([401, 404], `${path} exposed data with status ${response.status()}`).toContain(response.status());
    }
    await context.close();
  });
});

test.describe("hardening: authenticated workspace", () => {
  for (const path of coreWorkspacePages) {
    test(`${path} renders without browser or resource errors`, async ({ page }) => {
      await expectHealthyDocument(page, path);
    });
  }

  test("desktop and mobile navigation expose the same supported workspace", async ({ page }) => {
    await page.goto("/dashboard");
    const desktopLinks = await page
      .getByRole("navigation", { name: "Workspace navigation" })
      .getByRole("link")
      .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).pathname));
    expect(desktopLinks).not.toContain("/study");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open full navigation menu" }).click();
    const mobileNav = page.getByText("Navigate").locator("..");
    await expect(mobileNav.getByRole("link", { name: "Study", exact: true })).toHaveCount(0);
    for (const path of desktopLinks) {
      if (path === "/courses") await expect(page.getByRole("link", { name: "Courses", exact: true })).toBeVisible();
    }
  });

  test("retired planner surfaces cannot be used", async ({ page, request }) => {
    await page.goto("/study");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Study Planner", { exact: true })).toHaveCount(0);

    for (const path of [
      "/api/planner/plan?date=2026-08-23",
      "/api/planner/export",
      "/api/study/availability",
      "/api/study/blocks",
      "/api/study/grade-impact",
      "/api/study/heatmap",
      "/api/study/priorities",
      "/api/study/schedule",
    ]) {
      const response = await request.get(path);
      expect(response.status(), `${path} is still exposed`).toBe(404);
    }
    const generate = await request.post("/api/planner/generate", { data: { date: "2026-08-23" } });
    expect(generate.status(), "/api/planner/generate is still exposed").toBe(404);
  });
});
