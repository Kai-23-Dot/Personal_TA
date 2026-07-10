import { describe, it, expect } from "vitest";
import { nextOccurrence, occurrencesInWindow, type MeetingSlot } from "./schedule";

// Wednesday 2026-07-15 12:00 UTC.
const NOW = new Date("2026-07-15T12:00:00Z");

const weeklyMon19: MeetingSlot = { dayOfWeek: 1, startTime: "19:00", frequency: "weekly" };
const weeklyFri16: MeetingSlot = { dayOfWeek: 5, startTime: "16:00", frequency: "weekly" };

describe("nextOccurrence", () => {
  it("returns null for no slots", () => {
    expect(nextOccurrence([], NOW)).toBeNull();
  });

  it("finds the next weekly occurrence later this week", () => {
    expect(nextOccurrence([weeklyFri16], NOW)?.toISOString()).toBe("2026-07-17T16:00:00.000Z");
  });

  it("rolls to next week when this week's slot already passed", () => {
    // Monday 19:00 passed on the 13th → next is the 20th.
    expect(nextOccurrence([weeklyMon19], NOW)?.toISOString()).toBe("2026-07-20T19:00:00.000Z");
  });

  it("a slot later today still counts as today", () => {
    const wed18: MeetingSlot = { dayOfWeek: 3, startTime: "18:00", frequency: "weekly" };
    expect(nextOccurrence([wed18], NOW)?.toISOString()).toBe("2026-07-15T18:00:00.000Z");
  });

  it("picks the earliest across multiple slots", () => {
    expect(nextOccurrence([weeklyMon19, weeklyFri16], NOW)?.toISOString()).toBe(
      "2026-07-17T16:00:00.000Z"
    );
  });

  it("biweekly slots skip the off-parity week (anchored to createdAt)", () => {
    // Anchored to the week of Jul 6; the week of Jul 13 is odd parity, so the
    // Friday occurrence lands on the 24th, not the 17th.
    const biweekly: MeetingSlot = {
      dayOfWeek: 5,
      startTime: "16:00",
      frequency: "biweekly",
      createdAt: "2026-07-06T10:00:00Z",
    };
    expect(nextOccurrence([biweekly], NOW)?.toISOString()).toBe("2026-07-24T16:00:00.000Z");
  });
});

describe("occurrencesInWindow", () => {
  it("returns 0 for an empty or inverted window", () => {
    expect(occurrencesInWindow([weeklyMon19], NOW, NOW)).toBe(0);
    expect(occurrencesInWindow([weeklyMon19], NOW, new Date(NOW.getTime() - 1000))).toBe(0);
  });

  it("counts weekly occurrences in a 14-day window", () => {
    // Jul 1 → Jul 15: Mondays Jul 6 and Jul 13.
    const from = new Date("2026-07-01T12:00:00Z");
    expect(occurrencesInWindow([weeklyMon19], from, NOW)).toBe(2);
  });

  it("counts across multiple slots", () => {
    // Mondays: Jul 6, 13. Fridays: Jul 3, 10 (Jul 17 is outside).
    const from = new Date("2026-07-01T12:00:00Z");
    expect(occurrencesInWindow([weeklyMon19, weeklyFri16], from, NOW)).toBe(4);
  });

  it("biweekly slots occur half as often", () => {
    const biweekly: MeetingSlot = {
      dayOfWeek: 1,
      startTime: "19:00",
      frequency: "biweekly",
      createdAt: "2026-06-01T00:00:00Z",
    };
    const from = new Date("2026-06-15T00:00:00Z");
    const weeklyCount = occurrencesInWindow([weeklyMon19], from, NOW);
    const biweeklyCount = occurrencesInWindow([biweekly], from, NOW);
    expect(weeklyCount).toBe(5); // Mondays Jun 15, 22, 29, Jul 6, 13
    expect(biweeklyCount).toBeLessThan(weeklyCount);
    expect(biweeklyCount).toBeGreaterThan(0);
  });
});
