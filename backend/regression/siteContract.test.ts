import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function relativeLuminance(hex: string): number {
  const channels = hex.match(/[a-f\d]{2}/gi)?.map((value) => Number.parseInt(value, 16) / 255);
  if (!channels || channels.length !== 3) throw new Error(`Invalid hex color: ${hex}`);
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05)
    / (Math.min(firstLuminance, secondLuminance) + 0.05);
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
    const assignmentList = source("frontend/components/dashboard/today-assignment-list.tsx");
    const panels = source("frontend/components/dashboard/today-panels.tsx");
    expect(dashboard).toContain("<RecommendedNext");
    expect(dashboard).toContain("<TodayAssignmentList");
    expect(dashboard).toContain("<StudyOverview");
    expect(dashboard).toContain("lg:grid-cols-[minmax(0,1fr)_19rem]");
    expect(dashboard).toContain("dueThisWeek.length");
    expect(dashboard).toContain("hoursThisWeek");
    expect(dashboard).toContain("notes.length");
    expect(assignmentList).toContain("My assignments");
    expect(assignmentList).toContain("This week");
    expect(assignmentList).toContain("<SidePeek");
    expect(panels).toContain("Recommended next");
    expect(dashboard).not.toContain("blur-[90px]");
    expect(dashboard).not.toContain("rounded-3xl");
  });

  test("workspace shell uses flat document-style navigation", () => {
    const shell = source("frontend/components/layout/WorkspaceShell.tsx");
    const sidebar = source("frontend/components/layout/Sidebar.tsx");
    const header = source("frontend/components/layout/Header.tsx");
    expect(shell).toContain("data-notion-workspace-shell");
    expect(shell).toContain("md:pl-60");
    expect(shell).toContain("md:pl-16");
    expect(sidebar).toContain("fixed inset-y-0 left-0");
    expect(header).toContain("sticky top-0");
    expect(sidebar).not.toContain("rounded-3xl");
    expect(header).not.toContain("rounded-2xl border border-border/70");
  });

  test("workspace palette has one documented accent and accessible contrast", () => {
    const css = source("app/future-ui.css").toLowerCase();
    const palette = {
      canvas: "#0b1020",
      surface: "#11192a",
      borderControl: "#586a88",
      textPrimary: "#f4f7fb",
      textSecondary: "#c5cedd",
      textMuted: "#95a2b8",
      textTertiary: "#7887a0",
      accent: "#83b9ff",
      success: "#63d8aa",
      warning: "#f6c177",
      danger: "#ff8a9a",
    } as const;

    for (const color of Object.values(palette)) expect(css).toContain(color);
    for (const color of [
      palette.textPrimary,
      palette.textSecondary,
      palette.textMuted,
      palette.textTertiary,
      palette.accent,
      palette.success,
      palette.warning,
      palette.danger,
    ]) {
      expect(contrastRatio(color, palette.surface), `${color} must pass normal-text contrast`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(palette.borderControl, palette.surface)).toBeGreaterThanOrEqual(3);
    expect(css).toContain("[data-dashboard-shell] nav");
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

  test("grades includes the tested GPA and assignment prediction workspace", () => {
    const gradesPage = source("app/(dashboard)/grades/page.tsx");
    const predictor = source("frontend/components/grades/gpa-predictor.tsx");
    expect(gradesPage).toContain("GpaPredictor");
    expect(gradesPage).toContain("points_possible, weight, due_date");
    expect(predictor).toContain("GPA &amp; grade predictor");
    expect(predictor).toContain("predictPointsBasedGrade");
    expect(predictor).toContain("predictWeightedGrade");
    expect(predictor).toContain("scoreNeededForPointsTarget");
    expect(predictor).toContain("Estimate, not official");
    expect(predictor).toContain("Smartlearn never writes these what-if values back to Canvas");
  });
});
