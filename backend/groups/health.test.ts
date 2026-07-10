import { describe, it, expect } from "vitest";
import { computeGroupHealth, computeMemberStreaks, tierForScore, type HealthInput } from "./health";

// Fixed "now": Wednesday 2026-07-15 12:00 UTC.
const NOW = new Date("2026-07-15T12:00:00Z");

const WEEKLY_MON_19 = { dayOfWeek: 1, startTime: "19:00", frequency: "weekly" as const };

function baseInput(overrides: Partial<HealthInput> = {}): HealthInput {
  return {
    memberCount: 3,
    checkins: [],
    meetings: [WEEKLY_MON_19],
    createdAt: "2026-06-15T00:00:00Z", // 30 days old — grace long past
    targetEndDate: "2026-08-15",
    goalCompletedAt: null,
    progressPct: 0,
    goal: "Finish unit 3 review",
    now: NOW,
    ...overrides,
  };
}

describe("computeGroupHealth — state precedence", () => {
  it("legacy group without a goal is unscored", () => {
    expect(computeGroupHealth(baseInput({ goal: null }))).toEqual({ state: "unscored" });
  });

  it("group with goal text but no target date is unscored", () => {
    expect(computeGroupHealth(baseInput({ targetEndDate: null }))).toEqual({ state: "unscored" });
  });

  it("completed goal short-circuits to completed — even when completed late", () => {
    const result = computeGroupHealth(
      baseInput({
        targetEndDate: "2026-07-01", // already past
        goalCompletedAt: "2026-07-10T00:00:00Z", // completed after the deadline
      })
    );
    expect(result).toEqual({ state: "completed" });
  });

  it("completed early (target date still in the future) is completed", () => {
    const result = computeGroupHealth(
      baseInput({ goalCompletedAt: "2026-07-01T00:00:00Z", progressPct: 40 })
    );
    expect(result).toEqual({ state: "completed" });
  });

  it("brand-new group with zero elapsed occurrences gets the grace state", () => {
    // Created Tuesday 2026-07-14; weekly Monday slot — next occurrence is the 20th.
    const result = computeGroupHealth(baseInput({ createdAt: "2026-07-14T00:00:00Z" }));
    expect(result).toEqual({ state: "new" });
  });

  it("young group whose first session already elapsed IS scored (no grace)", () => {
    // Created Sunday 2026-07-12; Monday session on the 13th already happened.
    const result = computeGroupHealth(baseInput({ createdAt: "2026-07-12T00:00:00Z" }));
    expect(result.state).toBe("scored");
  });

  it("old group with zero elapsed occurrences is still scored (grace needs BOTH conditions)", () => {
    // 30 days old, but completely unattended — must show as critical, not "new".
    const result = computeGroupHealth(baseInput());
    expect(result.state).toBe("scored");
  });
});

describe("computeGroupHealth — attendance component", () => {
  it("zero check-ins with elapsed sessions → attendance 0 and tier critical", () => {
    const result = computeGroupHealth(baseInput({ progressPct: 0 }));
    expect(result.state).toBe("scored");
    if (result.state !== "scored") return;
    expect(result.components.attendance).toBe(0);
    expect(result.tier).toBe("critical");
  });

  it("full attendance from every member maxes the component at 50", () => {
    // Window 2026-07-01..15 contains Mondays Jul 6 and Jul 13 → expected = 3 members × 2.
    const checkins = ["u1", "u2", "u3"].flatMap((u) => [
      { userId: u, checkinDate: "2026-07-06" },
      { userId: u, checkinDate: "2026-07-13" },
    ]);
    const result = computeGroupHealth(baseInput({ checkins }));
    if (result.state !== "scored") throw new Error("expected scored");
    expect(result.components.attendance).toBe(50);
  });

  it("duplicate same-day check-ins by one user count once", () => {
    const dup = [
      { userId: "u1", checkinDate: "2026-07-13" },
      { userId: "u1", checkinDate: "2026-07-13" },
    ];
    const single = [{ userId: "u1", checkinDate: "2026-07-13" }];
    const a = computeGroupHealth(baseInput({ checkins: dup }));
    const b = computeGroupHealth(baseInput({ checkins: single }));
    expect(a).toEqual(b);
  });

  it("one-member group divides by its own expected sessions without blowing up", () => {
    const result = computeGroupHealth(
      baseInput({
        memberCount: 1,
        checkins: [
          { userId: "solo", checkinDate: "2026-07-06" },
          { userId: "solo", checkinDate: "2026-07-13" },
        ],
      })
    );
    if (result.state !== "scored") throw new Error("expected scored");
    expect(result.components.attendance).toBe(50);
  });

  it("memberCount of 0 is clamped — no division by zero", () => {
    const result = computeGroupHealth(baseInput({ memberCount: 0 }));
    expect(result.state).toBe("scored");
  });

  it("attendance window clamps to group age for young groups", () => {
    // Created Sunday 2026-07-12 (3 days ago): only Monday Jul 13 is in the clamped
    // window, so 1 member-day out of 1 member × 1 session = full marks.
    const result = computeGroupHealth(
      baseInput({
        memberCount: 1,
        createdAt: "2026-07-12T00:00:00Z",
        checkins: [{ userId: "u1", checkinDate: "2026-07-13" }],
      })
    );
    if (result.state !== "scored") throw new Error("expected scored");
    expect(result.components.attendance).toBe(50);
  });

  it("check-ins older than the window are ignored", () => {
    const result = computeGroupHealth(
      baseInput({ checkins: [{ userId: "u1", checkinDate: "2026-06-20" }] })
    );
    if (result.state !== "scored") throw new Error("expected scored");
    expect(result.components.attendance).toBe(0);
  });
});

describe("computeGroupHealth — streak component", () => {
  it("check-ins in each of the last 4 weeks max the streak at 20", () => {
    const checkins = [
      { userId: "u1", checkinDate: "2026-07-13" }, // this week
      { userId: "u1", checkinDate: "2026-07-06" },
      { userId: "u2", checkinDate: "2026-06-29" },
      { userId: "u1", checkinDate: "2026-06-22" },
    ];
    const result = computeGroupHealth(baseInput({ checkins }));
    if (result.state !== "scored") throw new Error("expected scored");
    expect(result.components.streak).toBe(20);
  });

  it("a skipped week breaks the streak", () => {
    const checkins = [
      { userId: "u1", checkinDate: "2026-07-13" }, // this week
      // nothing week of Jul 5
      { userId: "u1", checkinDate: "2026-06-29" }, // two weeks ago — doesn't count
    ];
    const result = computeGroupHealth(baseInput({ checkins }));
    if (result.state !== "scored") throw new Error("expected scored");
    expect(result.components.streak).toBe(5); // 1 week of 4 → 20 × 1/4
  });

  it("no check-in this week means streak 0 even with older activity", () => {
    const result = computeGroupHealth(
      baseInput({ checkins: [{ userId: "u1", checkinDate: "2026-07-06" }] })
    );
    if (result.state !== "scored") throw new Error("expected scored");
    expect(result.components.streak).toBe(0);
  });
});

describe("computeGroupHealth — progress component and overdue cap", () => {
  it("progress ahead of pace maxes the component at 30", () => {
    // Half the window elapsed, progress 100% → pace ratio 2, clamped to 1.
    const result = computeGroupHealth(baseInput({ progressPct: 100 }));
    if (result.state !== "scored") throw new Error("expected scored");
    expect(result.components.progress).toBe(30);
  });

  it("progress exactly on pace scores full progress marks", () => {
    // 30 of 61 days elapsed ≈ 49.2%; progress 50% → ratio ≈ 1.016 → clamped 1.
    const result = computeGroupHealth(baseInput({ progressPct: 50 }));
    if (result.state !== "scored") throw new Error("expected scored");
    expect(result.components.progress).toBe(30);
  });

  it("zero progress halfway through scores zero progress marks", () => {
    const result = computeGroupHealth(baseInput({ progressPct: 0 }));
    if (result.state !== "scored") throw new Error("expected scored");
    expect(result.components.progress).toBe(0);
  });

  it("targetEndDate equal to creation date does not divide by zero", () => {
    const result = computeGroupHealth(
      baseInput({ createdAt: "2026-07-01T00:00:00Z", targetEndDate: "2026-07-01", progressPct: 50 })
    );
    expect(result.state).toBe("scored");
  });

  it("past target date and incomplete caps the total at 45 (at-risk at best)", () => {
    // Everything else perfect: full attendance, full streak, progress 100.
    const checkins = ["u1", "u2", "u3"].flatMap((u) => [
      { userId: u, checkinDate: "2026-07-06" },
      { userId: u, checkinDate: "2026-07-13" },
      { userId: u, checkinDate: "2026-06-29" },
      { userId: u, checkinDate: "2026-06-22" },
    ]);
    const result = computeGroupHealth(
      baseInput({ targetEndDate: "2026-07-10", progressPct: 100, checkins })
    );
    if (result.state !== "scored") throw new Error("expected scored");
    expect(result.score).toBeLessThanOrEqual(45);
    expect(["at-risk", "critical"]).toContain(result.tier);
  });
});

describe("computeGroupHealth — determinism and tiers", () => {
  it("same input and same now produce identical output", () => {
    const input = baseInput({
      checkins: [{ userId: "u1", checkinDate: "2026-07-13" }],
      progressPct: 40,
    });
    expect(computeGroupHealth(input)).toEqual(computeGroupHealth({ ...input }));
  });

  it("tier thresholds map correctly", () => {
    expect(tierForScore(75)).toBe("thriving");
    expect(tierForScore(74)).toBe("steady");
    expect(tierForScore(50)).toBe("steady");
    expect(tierForScore(49)).toBe("at-risk");
    expect(tierForScore(25)).toBe("at-risk");
    expect(tierForScore(24)).toBe("critical");
    expect(tierForScore(0)).toBe("critical");
  });

  it("healthy active group scores thriving", () => {
    const checkins = ["u1", "u2", "u3"].flatMap((u) => [
      { userId: u, checkinDate: "2026-07-06" },
      { userId: u, checkinDate: "2026-07-13" },
      { userId: u, checkinDate: "2026-06-29" },
      { userId: u, checkinDate: "2026-06-22" },
    ]);
    const result = computeGroupHealth(baseInput({ checkins, progressPct: 60 }));
    if (result.state !== "scored") throw new Error("expected scored");
    expect(result.tier).toBe("thriving");
    expect(result.score).toBeGreaterThanOrEqual(75);
  });
});

describe("computeMemberStreaks", () => {
  it("counts consecutive days ending today", () => {
    const streaks = computeMemberStreaks(
      [
        { userId: "u1", checkinDate: "2026-07-15" },
        { userId: "u1", checkinDate: "2026-07-14" },
        { userId: "u1", checkinDate: "2026-07-13" },
      ],
      NOW
    );
    expect(streaks.u1).toBe(3);
  });

  it("a streak ending yesterday is not broken yet", () => {
    const streaks = computeMemberStreaks(
      [
        { userId: "u1", checkinDate: "2026-07-14" },
        { userId: "u1", checkinDate: "2026-07-13" },
      ],
      NOW
    );
    expect(streaks.u1).toBe(2);
  });

  it("a gap breaks the streak", () => {
    const streaks = computeMemberStreaks(
      [
        { userId: "u1", checkinDate: "2026-07-15" },
        { userId: "u1", checkinDate: "2026-07-12" },
      ],
      NOW
    );
    expect(streaks.u1).toBe(1);
  });

  it("no check-ins in the last two days means streak 0", () => {
    const streaks = computeMemberStreaks([{ userId: "u1", checkinDate: "2026-07-10" }], NOW);
    expect(streaks.u1).toBe(0);
  });

  it("streaks are independent per member", () => {
    const streaks = computeMemberStreaks(
      [
        { userId: "u1", checkinDate: "2026-07-15" },
        { userId: "u2", checkinDate: "2026-07-15" },
        { userId: "u2", checkinDate: "2026-07-14" },
      ],
      NOW
    );
    expect(streaks.u1).toBe(1);
    expect(streaks.u2).toBe(2);
  });
});
