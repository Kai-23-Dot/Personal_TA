import { describe, it, expect } from "vitest";
import { deriveGoalStatus, computeCompletionStats, type GoalFields } from "./completion";

const NOW = new Date("2026-07-15T12:00:00Z");

function g(overrides: Partial<GoalFields> = {}): GoalFields {
  return {
    goal: "Finish unit 3",
    targetEndDate: "2026-08-01",
    goalCompletedAt: null,
    ...overrides,
  };
}

describe("deriveGoalStatus", () => {
  it("no goal → no_goal", () => {
    expect(deriveGoalStatus(g({ goal: null }), NOW)).toBe("no_goal");
  });

  it("goal text without a target date → no_goal", () => {
    expect(deriveGoalStatus(g({ targetEndDate: null }), NOW)).toBe("no_goal");
  });

  it("future target date, not completed → active", () => {
    expect(deriveGoalStatus(g(), NOW)).toBe("active");
  });

  it("target date is today → still active (strictly-after comparison)", () => {
    expect(deriveGoalStatus(g({ targetEndDate: "2026-07-15" }), NOW)).toBe("active");
  });

  it("past target date, not completed → ended_incomplete", () => {
    expect(deriveGoalStatus(g({ targetEndDate: "2026-07-14" }), NOW)).toBe("ended_incomplete");
  });

  it("completed before the deadline → completed", () => {
    expect(deriveGoalStatus(g({ goalCompletedAt: "2026-07-01T00:00:00Z" }), NOW)).toBe("completed");
  });

  it("completed AFTER the deadline still counts as completed (completion wins)", () => {
    expect(
      deriveGoalStatus(
        g({ targetEndDate: "2026-07-01", goalCompletedAt: "2026-07-10T00:00:00Z" }),
        NOW
      )
    ).toBe("completed");
  });
});

describe("computeCompletionStats", () => {
  it("empty input yields zero everything and a null rate", () => {
    expect(computeCompletionStats([], NOW)).toEqual({
      eligibleGroups: 0,
      completedGoals: 0,
      endedIncomplete: 0,
      activeGoals: 0,
      legacyGroups: 0,
      completionRate: null,
    });
  });

  it("only active goals → rate stays null (no known outcomes yet)", () => {
    const stats = computeCompletionStats([g(), g()], NOW);
    expect(stats.activeGoals).toBe(2);
    expect(stats.eligibleGroups).toBe(0);
    expect(stats.completionRate).toBeNull();
  });

  it("legacy groups never enter the metric", () => {
    const stats = computeCompletionStats(
      [g({ goal: null }), g({ goalCompletedAt: "2026-07-01T00:00:00Z" })],
      NOW
    );
    expect(stats.legacyGroups).toBe(1);
    expect(stats.eligibleGroups).toBe(1);
    expect(stats.completionRate).toBe(1);
  });

  it("computes the investor rate: completed / (completed + ended incomplete)", () => {
    const stats = computeCompletionStats(
      [
        g({ goalCompletedAt: "2026-06-01T00:00:00Z" }), // completed
        g({ goalCompletedAt: "2026-07-10T00:00:00Z", targetEndDate: "2026-07-01" }), // completed late
        g({ targetEndDate: "2026-07-01" }), // ended incomplete
        g(), // active
        g({ goal: null }), // legacy
      ],
      NOW
    );
    expect(stats).toEqual({
      eligibleGroups: 3,
      completedGoals: 2,
      endedIncomplete: 1,
      activeGoals: 1,
      legacyGroups: 1,
      completionRate: 2 / 3,
    });
  });
});
