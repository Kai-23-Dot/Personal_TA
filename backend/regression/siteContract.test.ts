import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

const retiredPlannerApis = [
  "app/api/planner/export/route.ts",
  "app/api/planner/generate/route.ts",
  "app/api/planner/plan/route.ts",
  "app/api/study/availability/route.ts",
  "app/api/study/blocks/route.ts",
  "app/api/study/grade-impact/route.ts",
  "app/api/study/heatmap/route.ts",
  "app/api/study/priorities/route.ts",
  "app/api/study/schedule/route.ts",
] as const;

describe("website product-surface contract", () => {
  test("all primary public pages exist", () => {
    for (const page of ["page", "about/page", "contact/page", "privacy/page", "terms/page"]) {
      expect(existsSync(join(ROOT, "app", `${page}.tsx`)), `${page} is missing`).toBe(true);
    }
  });

  test("all supported workspace destinations exist", () => {
    for (const page of [
      "dashboard",
      "courses",
      "assignments",
      "notes",
      "practice",
      "flashcards",
      "review",
      "focus",
      "grades",
      "groups",
      "settings",
    ]) {
      expect(
        existsSync(join(ROOT, "app/(dashboard)", page, "page.tsx")),
        `${page} workspace page is missing`
      ).toBe(true);
    }
  });

  test("workspace navigation has no study-planner destination", () => {
    const nav = source("frontend/lib/nav-items.ts");
    expect(nav).not.toMatch(/href:\s*["']\/study["']/);
    expect(nav).not.toMatch(/label:\s*["']Study["']/);
  });

  test("old study-planner URLs safely return users to the dashboard", () => {
    const retiredPage = source("app/(dashboard)/study/page.tsx");
    expect(retiredPage).toContain('redirect("/dashboard")');
    expect(retiredPage).not.toMatch(/Study Planner|Generate Plan|weekly availability/i);
  });

  test("planner-only API handlers are not exposed", () => {
    for (const path of retiredPlannerApis) {
      expect(existsSync(join(ROOT, path)), `${path} should be retired`).toBe(false);
    }
  });

  test("dashboard actions never link to the retired planner", () => {
    expect(source("app/(dashboard)/dashboard/page.tsx")).not.toMatch(/href=[{]?["']\/study["']/);
  });

  test("dashboard uses a responsive Notion-style workspace with live account signals", () => {
    const dashboard = source("app/(dashboard)/dashboard/page.tsx");
    expect(dashboard).toContain("data-dashboard-command-center");
    expect(dashboard).toContain("data-dashboard-notion-workspace");
    expect(dashboard).toContain("data-dashboard-primary-action");
    expect(dashboard).toContain("data-dashboard-deadline-database");
    expect(dashboard).toContain("data-dashboard-course-database");
    expect(dashboard).toContain("sm:grid-cols-2 xl:grid-cols-4");
    expect(dashboard).toContain("xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]");
    expect(dashboard).toContain("upcomingAssignments.length");
    expect(dashboard).toContain("hoursThisWeek");
    expect(dashboard).toContain("notesCount");
    expect(dashboard).toContain("courseDeadlines.length");
    expect(dashboard).not.toContain("blur-[90px]");
  });

  test("workspace shell uses flat document-style navigation", () => {
    const layout = source("app/(dashboard)/layout.tsx");
    const sidebar = source("frontend/components/layout/Sidebar.tsx");
    const header = source("frontend/components/layout/Header.tsx");
    expect(layout).toContain("data-notion-workspace-shell");
    expect(layout).toContain("md:pl-60");
    expect(sidebar).toContain("fixed inset-y-0 left-0");
    expect(header).toContain("sticky top-0");
    expect(sidebar).not.toContain("rounded-3xl");
    expect(header).not.toContain("rounded-2xl border border-border/70");
  });

  test("dashboard redesign research covers at least fifty distinct references", () => {
    const research = source("docs/dashboard-redesign-research.md");
    const reviewedRows = research.match(/^\|\s*\d+\s*\|/gm) ?? [];
    expect(reviewedRows.length).toBeGreaterThanOrEqual(50);
  });

  test("onboarding does not require a removed planner step", () => {
    const onboarding = source("app/(dashboard)/onboarding/page.tsx");
    expect(onboarding).not.toMatch(/generatePlan|href:\s*["']\/study["']/);
  });

  test("the assistant does not query or advertise retired plans", () => {
    for (const path of [
      "app/api/chat/route.ts",
      "app/api/chat/context/route.ts",
      "backend/ai/agent.ts",
      "frontend/components/layout/GlobalAssistant.tsx",
    ]) {
      expect(source(path), `${path} still references the planner`).not.toMatch(
        /study_plans|todayPlan|TODAY'S STUDY PLAN|study plan/i
      );
    }
  });

  test("the retained recommendation endpoint remains available for dashboard priorities", () => {
    const recommendationRoute = "app/api/study/recommendations/route.ts";
    expect(existsSync(join(ROOT, recommendationRoute))).toBe(true);
    expect(source(recommendationRoute)).toContain("export async function GET");
  });

  test("generic Tailwind display classes cannot inherit the legacy polygon animation", () => {
    const css = source("app/chain-summit.css");
    expect(css).not.toMatch(/^\.block(?:\s|,|\{|:)/m);
    expect(css).toMatch(/\.blockchain-visual\s+\.block/);
  });

  test("flashcards can toggle between question and answer without leaving the card", () => {
    const flashcards = source("app/(dashboard)/flashcards/page.tsx");
    expect(flashcards).toContain("setIsFlipped((flipped) => !flipped)");
    expect(flashcards).toContain("View question");
    expect(flashcards).toContain("Tap to flip back");
    expect(flashcards).not.toContain("if (!isFlipped) setIsFlipped(true)");
  });

  test("long flashcards have top-anchored independent scroll regions", () => {
    const flashcards = source("app/(dashboard)/flashcards/page.tsx");
    expect(flashcards).toContain('data-card-scroll="question"');
    expect(flashcards).toContain('data-card-scroll="answer"');
    expect(flashcards).toContain('questionUsesReadingLayout ? "items-start" : "items-center"');
    expect(flashcards).toContain('answerUsesReadingLayout ? "items-start" : "items-center"');
    expect(flashcards).toContain("touch-pan-y overflow-y-auto");
  });
});
