import { describe, it, expect } from "vitest";
import { validateCreateGroup } from "./validation";

const NOW = new Date("2026-07-15T12:00:00Z");

const VALID = {
  name: "AP Chem crunch",
  description: "Nightly review before the final",
  goal: "Finish units 5-7 review before the final",
  targetEndDate: "2026-08-01",
  meetings: [{ dayOfWeek: 1, startTime: "19:00", frequency: "weekly" as const }],
};

function expectError(body: unknown, fragment: string) {
  const result = validateCreateGroup(body, NOW);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.toLowerCase()).toContain(fragment.toLowerCase());
}

describe("validateCreateGroup — happy path", () => {
  it("accepts a fully valid payload and trims strings", () => {
    const result = validateCreateGroup({ ...VALID, name: "  AP Chem crunch  " }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("AP Chem crunch");
    expect(result.value.meetings).toHaveLength(1);
  });

  it("accepts multiple distinct meeting slots and optional courseId null", () => {
    const result = validateCreateGroup(
      {
        ...VALID,
        courseId: null,
        meetings: [
          { dayOfWeek: 1, startTime: "19:00", frequency: "weekly" },
          { dayOfWeek: 4, startTime: "19:00", frequency: "biweekly" },
        ],
      },
      NOW
    );
    expect(result.ok).toBe(true);
  });
});

describe("validateCreateGroup — 400 cases (each mirrored by an API test)", () => {
  it("rejects a missing name", () => expectError({ ...VALID, name: undefined }, "name"));
  it("rejects a blank name", () => expectError({ ...VALID, name: "   " }, "name"));
  it("rejects a name over 80 chars", () => expectError({ ...VALID, name: "x".repeat(81) }, "80"));

  it("rejects a missing goal", () => expectError({ ...VALID, goal: undefined }, "goal"));
  it("rejects a blank goal", () => expectError({ ...VALID, goal: "  " }, "goal"));
  it("rejects a goal over 500 chars", () => expectError({ ...VALID, goal: "x".repeat(501) }, "500"));

  it("rejects a missing target date", () =>
    expectError({ ...VALID, targetEndDate: undefined }, "target end date"));
  it("rejects a malformed target date", () =>
    expectError({ ...VALID, targetEndDate: "08/01/2026" }, "YYYY-MM-DD"));
  it("rejects an impossible calendar date", () =>
    expectError({ ...VALID, targetEndDate: "2026-02-30" }, "real calendar date"));
  it("rejects a past target date", () =>
    expectError({ ...VALID, targetEndDate: "2026-07-01" }, "future"));
  it("rejects today as the target date (must be strictly future)", () =>
    expectError({ ...VALID, targetEndDate: "2026-07-15" }, "future"));
  it("rejects a target date more than 2 years out", () =>
    expectError({ ...VALID, targetEndDate: "2029-01-01" }, "2 years"));

  it("rejects missing meetings", () => expectError({ ...VALID, meetings: undefined }, "meeting"));
  it("rejects an empty meetings array", () => expectError({ ...VALID, meetings: [] }, "at least one"));
  it("rejects more than 7 slots", () =>
    expectError(
      {
        ...VALID,
        meetings: Array.from({ length: 8 }, (_, i) => ({
          dayOfWeek: i % 7,
          startTime: `0${i}:00`.slice(-5),
          frequency: "weekly",
        })),
      },
      "at most 7"
    ));
  it("rejects an out-of-range dayOfWeek", () =>
    expectError(
      { ...VALID, meetings: [{ dayOfWeek: 7, startTime: "19:00", frequency: "weekly" }] },
      "between 0"
    ));
  it("rejects a malformed startTime", () =>
    expectError(
      { ...VALID, meetings: [{ dayOfWeek: 1, startTime: "7pm", frequency: "weekly" }] },
      "HH:MM"
    ));
  it("rejects an invalid frequency", () =>
    expectError(
      { ...VALID, meetings: [{ dayOfWeek: 1, startTime: "19:00", frequency: "daily" }] },
      "weekly or biweekly"
    ));
  it("rejects duplicate (day, time) slots", () =>
    expectError(
      {
        ...VALID,
        meetings: [
          { dayOfWeek: 1, startTime: "19:00", frequency: "weekly" },
          { dayOfWeek: 1, startTime: "19:00", frequency: "biweekly" },
        ],
      },
      "unique"
    ));

  it("rejects a non-object body", () => {
    expect(validateCreateGroup(null, NOW).ok).toBe(false);
    expect(validateCreateGroup("nope", NOW).ok).toBe(false);
  });
});
