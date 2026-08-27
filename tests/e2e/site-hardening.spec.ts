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

  test("AI Assistant sends the current rendered workspace with each question", async ({ page }) => {
    await page.route("**/api/chat/context", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
    });

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Open AI Assistant" }).click();
    await expect(page.getByText("Current screen context connected")).toBeVisible();
    await page.getByPlaceholder("Ask anything...").fill("What am I looking at right now?");
    const requestPromise = page.waitForRequest("**/api/chat/context");
    await page.getByRole("button", { name: "Send message" }).click();
    const requestBody = (await requestPromise).postDataJSON() as { context?: string };

    expect(requestBody.context).toContain("CURRENT SCREEN CONTENT");
    expect(requestBody.context).toContain("Route: /dashboard");
    expect(requestBody.context).toContain("Visible workspace content");
  });

  test("AI Assistant receives the verified submitted practice results", async ({ page }) => {
    await page.route("**/api/practice/session?sessionId=e2e-screen-context", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "e2e-screen-context",
          topic: "Critical Thinking",
          difficulty: "medium",
          question_count: 2,
          course_id: null,
          status: "active",
          questions: [
            {
              question: "Why identify assumptions in an argument?",
              type: "multiple_choice",
              options: ["To find logical gaps", "To avoid reading evidence"],
              correct_answer: "To find logical gaps",
              explanation: "Assumptions can expose hidden weaknesses in reasoning.",
              difficulty: "medium",
            },
            {
              question: "What demonstrates critical thinking?",
              type: "multiple_choice",
              options: ["Compare evidence", "Ignore other views"],
              correct_answer: "Compare evidence",
              explanation: "Comparing evidence reveals the limits of each view.",
              difficulty: "medium",
            },
          ],
        }),
      });
    });
    await page.route("**/api/practice/generate", async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      } else {
        await route.continue();
      }
    });
    await page.route("**/api/chat/context", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
    });

    await page.goto("/practice/session?sessionId=e2e-screen-context");
    await page.getByLabel("To find logical gaps").check();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Ignore other views").check();
    await page.getByRole("button", { name: "Submit Test" }).click();
    await expect(page.getByRole("heading", { name: "Test Results" })).toBeVisible();
    await expect(page.getByText("1 / 2", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Open AI Assistant" }).click();
    await expect(page.getByText("Current screen context connected")).toBeVisible();
    await page.getByPlaceholder("Ask anything...").fill("Did I get every question correct?");
    const requestPromise = page.waitForRequest("**/api/chat/context");
    await page.getByRole("button", { name: "Send message" }).click();
    const requestBody = (await requestPromise).postDataJSON() as { context?: string };

    expect(requestBody.context).toContain("Practice state: submitted results (review mode)");
    expect(requestBody.context).toContain("Verified score: 1 of 2 (50% correct)");
    expect(requestBody.context).toContain("Overall verification: Not every question is correct.");
    expect(requestBody.context).toContain("Incorrect question numbers: 2");
    expect(requestBody.context).toContain("Question 2 — INCORRECT");
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
