import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  ADAPTIVE_TARGET_THRESHOLD_PCT,
  MASTERY_THRESHOLD_PCT,
  WEAK_THRESHOLD_PCT,
  isMastered,
} from "./mastery";

const ROOT = process.cwd();

function apiRouteFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) apiRouteFiles(full, found);
    else if (entry.name === "route.ts") found.push(full);
  }
  return found;
}

describe("study mastery thresholds", () => {
  test("mastery matches the band the database writes", () => {
    // submit_practice_session (migration 015) writes mastery_level = 'mastered'
    // at >= 0.85. If that moves, this constant has to move with it or the API
    // and the database will disagree about what "done" means.
    const migration = readFileSync(
      join(ROOT, "supabase/migrations/015_production_hardening.sql"),
      "utf8"
    );
    expect(migration).toContain(">= 0.85 THEN 'mastered'");
    expect(MASTERY_THRESHOLD_PCT).toBe(85);
  });

  test("a mastered topic is done, a weak one is not", () => {
    expect(isMastered(85)).toBe(true);
    expect(isMastered(92)).toBe(true);
    expect(isMastered(84.9)).toBe(false);
    expect(isMastered(50)).toBe(false);
    // No score recorded is not the same as mastered.
    expect(isMastered(null)).toBe(false);
    expect(isMastered(undefined)).toBe(false);
  });

  test("the three bars are ordered", () => {
    // Targeted for practice < worth flagging as weak < done with.
    expect(ADAPTIVE_TARGET_THRESHOLD_PCT).toBeLessThan(WEAK_THRESHOLD_PCT);
    expect(WEAK_THRESHOLD_PCT).toBeLessThan(MASTERY_THRESHOLD_PCT);
  });

  test("no API route hardcodes an accuracy threshold", () => {
    // These numbers were previously scattered across five routes, which is how
    // the review panel ended up promising "below 70%" while its query returned
    // the lowest five at any score.
    const offenders: string[] = [];
    for (const file of apiRouteFiles(join(ROOT, "app/api"))) {
      const source = readFileSync(file, "utf8");
      if (/accuracy_pct"?\s*,\s*\d+/.test(source) || /accuracy_pct\s*[<>]=?\s*\d+/.test(source)) {
        offenders.push(file.replace(`${ROOT}/`, ""));
      }
    }
    expect(offenders, `hardcoded accuracy thresholds in: ${offenders.join(", ")}`).toEqual([]);
  });

  test("study priorities exclude mastered topics", () => {
    // The behaviour this whole module exists for: a topic you have finished
    // stops being offered as the next thing to practise.
    const route = readFileSync(join(ROOT, "app/api/study/recommendations/route.ts"), "utf8");
    expect(route).toContain("MASTERY_THRESHOLD_PCT");
    expect(route).toMatch(/\.lt\("accuracy_pct",\s*MASTERY_THRESHOLD_PCT\)/);
  });
});
