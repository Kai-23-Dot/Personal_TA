import { describe, it, expect } from "vitest";
import { toMeetingSlots, toCheckinInputs, deriveGroupSignals } from "./mappers";

const NOW = new Date("2026-07-15T12:00:00Z");

describe("row mappers", () => {
  it("maps meeting rows to slots, defaulting unknown frequencies to weekly", () => {
    expect(
      toMeetingSlots([
        { day_of_week: 1, start_time: "19:00:00", frequency: "biweekly", created_at: "2026-07-01T00:00:00Z" },
        { day_of_week: 5, start_time: "16:00:00", frequency: "garbage" },
      ])
    ).toEqual([
      { dayOfWeek: 1, startTime: "19:00:00", frequency: "biweekly", createdAt: "2026-07-01T00:00:00Z" },
      { dayOfWeek: 5, startTime: "16:00:00", frequency: "weekly", createdAt: undefined },
    ]);
  });

  it("maps checkin rows", () => {
    expect(toCheckinInputs([{ user_id: "u1", checkin_date: "2026-07-14" }])).toEqual([
      { userId: "u1", checkinDate: "2026-07-14" },
    ]);
  });
});

describe("deriveGroupSignals", () => {
  it("derives health, goal status, and next meeting in one call", () => {
    const signals = deriveGroupSignals(
      {
        goal: "Finish unit 3",
        target_end_date: "2026-08-15",
        goal_completed_at: null,
        progress_pct: 50,
        created_at: "2026-06-15T00:00:00Z",
      },
      [{ day_of_week: 5, start_time: "16:00:00", frequency: "weekly" }],
      [{ user_id: "u1", checkin_date: "2026-07-10" }],
      2,
      NOW
    );
    expect(signals.goalStatus).toBe("active");
    expect(signals.health.state).toBe("scored");
    expect(signals.nextMeetingAt).toBe("2026-07-17T16:00:00.000Z");
  });

  it("legacy group without goal: unscored health, no_goal status, null progress treated as 0", () => {
    const signals = deriveGroupSignals(
      { goal: null, target_end_date: null, goal_completed_at: null, progress_pct: null, created_at: "2026-01-01T00:00:00Z" },
      [],
      [],
      3,
      NOW
    );
    expect(signals.health).toEqual({ state: "unscored" });
    expect(signals.goalStatus).toBe("no_goal");
    expect(signals.nextMeetingAt).toBeNull();
  });
});
