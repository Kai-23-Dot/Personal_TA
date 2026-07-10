/**
 * Browser e2e: the full goal-bound group journey —
 * create via UI → card shows health/goal → detail panels → one-tap check-in →
 * progress update → mark complete → completed badge everywhere.
 * Cleanup deletes the group via the API in afterAll.
 */
import { test, expect } from "@playwright/test";
import { E2E_PREFIX } from "./global-setup";

const runId = Date.now();
const groupName = `${E2E_PREFIX}flow-${runId}`;
let createdGroupId: string | null = null;

function futureDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
}

test.describe.configure({ mode: "serial" });

test.describe("goal-bound group flow", () => {
  test.afterAll(async ({ request }) => {
    if (createdGroupId) await request.delete(`/api/groups/${createdGroupId}`).catch(() => {});
  });

  test("create a goal-bound group through the UI", async ({ page }) => {
    await page.goto("/groups");
    await page.getByRole("button", { name: "Create group" }).first().click();

    // Submit stays disabled until every required field is valid.
    const submit = page.getByRole("button", { name: "Create group" }).last();
    await expect(submit).toBeDisabled();

    await page.getByLabel("Group name *").fill(groupName);
    await page.getByLabel(/Goal — what will this group finish/).fill("Finish the e2e journey");
    await page.getByLabel("Target end date *").fill(futureDate(14));
    await expect(submit).toBeDisabled(); // meeting time still empty
    await page.getByLabel("Meeting time").fill("19:00");

    await expect(submit).toBeEnabled();
    await submit.click();

    // Card appears with goal text and a health badge (new groups get "New").
    const card = page.locator("div.group", { hasText: groupName });
    await expect(card).toBeVisible();
    await expect(card.getByText("Finish the e2e journey")).toBeVisible();
    await expect(card.getByText(/New|Critical|At risk|Steady|Thriving/).first()).toBeVisible();
    await expect(card.getByText("14 days left")).toBeVisible();
  });

  test("detail page shows goal, schedule, and check-in works one-tap", async ({ page, request }) => {
    // Resolve the group id via API for stable navigation + cleanup.
    const list = await request.get("/api/groups");
    const { groups } = await list.json();
    const group = (groups as { id: string; name: string }[]).find((g) => g.name === groupName);
    expect(group).toBeTruthy();
    createdGroupId = group!.id;

    await page.goto(`/groups/${createdGroupId}`);

    await expect(page.getByRole("heading", { name: "Goal & health" })).toBeVisible();
    await expect(page.getByText("Finish the e2e journey")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Schedule & check-in" })).toBeVisible();
    await expect(page.getByText(/Mondays · 7:00 PM/)).toBeVisible();

    // One-tap check-in flips the button and updates the roster count.
    const checkin = page.getByRole("button", { name: "Check in for today" });
    await expect(checkin).toBeVisible();
    await checkin.click();
    await expect(page.getByRole("button", { name: "Checked in today" })).toBeVisible();
    await expect(page.getByText(/1 of 1 member(s)? checked in today/)).toBeVisible();

    // Member streak chip shows a 1-day streak.
    await expect(page.getByTitle(/1-day check-in streak/)).toBeVisible();
  });

  test("owner sets progress and marks the goal complete", async ({ page }) => {
    await page.goto(`/groups/${createdGroupId}`);

    // Progress slider → 50 → Save.
    await page.getByLabel("Goal progress percentage").fill("50");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("50%").first()).toBeVisible();

    // Mark complete (accept the confirm dialog).
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Mark goal complete" }).click();
    await expect(page.getByText(/Goal completed/).first()).toBeVisible();

    // Back on the browse page the card shows the completed badge too.
    await page.goto("/groups");
    const card = page.locator("div.group", { hasText: groupName });
    await expect(card.getByText("Goal completed")).toBeVisible();
  });
});
