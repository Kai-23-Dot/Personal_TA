import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

/**
 * Every .tsx rendered inside the workspace shell.
 *
 * The public site keeps its own dark palette, so the components it owns are
 * excluded: the auth screens and the three Smartlearn* layout pieces are
 * rendered outside [data-dashboard-shell] and are allowed raw hue utilities.
 */
function workspaceSourceFiles(): string[] {
  const PUBLIC_ONLY = ["frontend/components/auth/", "frontend/components/layout/Smartlearn"];
  const roots = ["app/(dashboard)", "frontend/components"];
  const found: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".tsx")) {
        const rel = relative(ROOT, full);
        if (!PUBLIC_ONLY.some((prefix) => rel.startsWith(prefix))) found.push(rel);
      }
    }
  };

  for (const root of roots) {
    const dir = join(ROOT, root);
    if (existsSync(dir)) walk(dir);
  }
  return found;
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
    expect(dashboard).not.toContain('aria-label="Breadcrumb"');
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

  test("workspace palette has one documented accent and accessible contrast", () => {
    // The workspace palette moved from future-ui.css (a dark navy theme applied
    // over the components with !important) to notion-workspace.css, which sets
    // the design tokens directly. The contract is unchanged in spirit: one
    // accent, and every text colour readable on the surfaces it actually sits on.
    const css = source("app/notion-workspace.css").toLowerCase();
    // The palette moved from Notion's warm greys to a cool slate scale. The
    // contract is unchanged: one accent, and every text colour readable on the
    // surfaces it actually sits on. The values below are the ones that clear
    // that bar — slate-500 (#64748b) and slate-400 (#94a3b8), the shades most
    // reached for as secondary and tertiary text, do not.
    const palette = {
      canvas: "#f8fafc",
      card: "#ffffff",
      rail: "#f1f5f9",
      controlBorder: "#7e8fa9",
      ink: "#1e293b",
      inkMuted: "#475569",
      inkFaint: "#627188",
      accent: "#2563eb",
    } as const;

    for (const color of Object.values(palette)) expect(css).toContain(color);

    // Text is checked against BOTH surfaces it can land on. The rail is the
    // darker of the two and so the binding constraint.
    for (const color of [palette.ink, palette.inkMuted, palette.inkFaint, palette.accent]) {
      for (const surface of [palette.card, palette.canvas, palette.rail]) {
        expect(
          contrastRatio(color, surface),
          `${color} must pass normal-text contrast on ${surface}`
        ).toBeGreaterThanOrEqual(4.5);
      }
    }

    // The accent doubles as a filled button, so white on it must also pass.
    expect(contrastRatio("#ffffff", palette.accent)).toBeGreaterThanOrEqual(4.5);

    // Control boundaries are non-text UI: WCAG 1.4.11 sets the bar at 3:1.
    for (const surface of [palette.card, palette.canvas, palette.rail]) {
      expect(contrastRatio(palette.controlBorder, surface)).toBeGreaterThanOrEqual(3);
    }

    // The workspace theme must not go back to overriding components: the token
    // layer exists so that it does not need !important. The single sanctioned
    // exception is the reduced-motion block, where !important is the standard
    // idiom for cancelling animation the page asked for.
    const declarations = css
      .replace(/\/\*[\s\S]*?\*\//g, "")                              // comments
      .replace(/@media \(prefers-reduced-motion[\s\S]*?\n}\n/g, "");  // motion reset
    expect(declarations).not.toContain("!important");

    // The three legacy stylesheets (chain-summit.css, hero.css, future-ui.css)
    // are no longer loaded — only 21 of their 260 classes were still referenced,
    // and the rest kept repainting the new design through unscoped element
    // selectors. The assertion that used to live here guarded the workspace from
    // one of those unscoped rules; there is nothing left to guard against.
    const layout = source("app/layout.tsx");
    for (const retired of ["chain-summit.css", "hero.css", "future-ui.css"]) {
      expect(layout, `${retired} must stay unloaded`).not.toContain(retired);
    }
  });

  test("workspace markup colours come only from the palette", () => {
    // The complaint this encodes: the same three meanings were being spelled a
    // dozen ways (emerald/green for success, amber/orange/yellow for warning,
    // rose/red for danger, sky at four shades for the accent), plus violet and
    // cyan that encoded nothing. Colour in the workspace now comes from the
    // tokens in notion-workspace.css, so a raw hue utility here is a regression.
    const HUES = "sky|emerald|violet|indigo|rose|amber|orange|cyan|teal|purple|pink|green|red|blue|yellow";
    const hueUtility = new RegExp(
      String.raw`\b(?:bg|text|border|ring|fill|stroke|from|via|to)-(?:${HUES})-\d{2,3}\b`
    );
    const offenders = workspaceSourceFiles().filter((file) =>
      hueUtility.test(source(file))
    );
    expect(offenders, `raw hue utilities found in: ${offenders.join(", ")}`).toEqual([]);
  });

  test("a destination has one icon everywhere it appears", () => {
    // Quick links, the ⌘K results and the rail all point at the same routes and
    // had drifted apart (/flashcards was a stack in the rail and a sparkle in
    // Quick links). Icons are looked up by href from one registry instead.
    const navItems = source("frontend/lib/nav-items.ts");
    expect(navItems).toContain("export function iconForHref");
    expect(source("app/(dashboard)/dashboard/page.tsx")).toContain("iconForHref");
  });

  test("portalled overlays mount inside the theme that opened them", () => {
    // Radix portals default to document.body, which is outside
    // [data-dashboard-shell] — so a Select menu opened in the light workspace
    // inherited the public site's dark :root and rendered navy on navy.
    for (const file of ["frontend/components/ui/select.tsx", "frontend/components/ui/dialog.tsx"]) {
      expect(source(file), `${file} must pass a portal container`).toContain("usePortalContainer");
    }
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
