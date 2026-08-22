import { describe, expect, it } from "vitest";
import {
  PAID_PLAN_IDS,
  PLAN_CATALOG,
  PLAN_RANK,
  planActionLabel,
} from "./plans";

describe("billing plan catalog", () => {
  it("defines the requested monthly prices", () => {
    expect(PLAN_CATALOG.free.monthlyPriceCents).toBe(0);
    expect(PLAN_CATALOG.plus.monthlyPriceCents).toBe(499);
    expect(PLAN_CATALOG.pro.monthlyPriceCents).toBe(1_999);
    expect(PLAN_CATALOG.max.monthlyPriceCents).toBe(2_999);
  });

  it("keeps Free as a low-cost product trial", () => {
    expect(PLAN_CATALOG.free.limits).toEqual({
      practiceTestsPerMonth: 2,
      notesPerMonth: 5,
      aiCreditsPerMonth: 100,
      audioMinutesPerMonth: 3,
      storageMegabytes: 100,
    });
    expect(PLAN_CATALOG.free.limits.aiCreditsPerMonth / 1_000).toBeLessThanOrEqual(
      0.1
    );
  });

  it("increases every allowance with each paid tier", () => {
    const plans = ["free", ...PAID_PLAN_IDS] as const;
    for (let index = 1; index < plans.length; index += 1) {
      const previous = PLAN_CATALOG[plans[index - 1]].limits;
      const current = PLAN_CATALOG[plans[index]].limits;
      expect(current.practiceTestsPerMonth).toBeGreaterThan(previous.practiceTestsPerMonth);
      expect(current.notesPerMonth).toBeGreaterThan(previous.notesPerMonth);
      expect(current.aiCreditsPerMonth).toBeGreaterThan(previous.aiCreditsPerMonth);
      expect(current.audioMinutesPerMonth).toBeGreaterThan(previous.audioMinutesPerMonth);
      expect(current.storageMegabytes).toBeGreaterThan(previous.storageMegabytes);
      expect(PLAN_RANK[plans[index]]).toBeGreaterThan(PLAN_RANK[plans[index - 1]]);
    }
  });

  it("keeps at least a 60% contribution margin at full metered allowance", () => {
    const infrastructureReserveCents = { plus: 25, pro: 100, max: 200 };

    for (const plan of PAID_PLAN_IDS) {
      const definition = PLAN_CATALOG[plan];
      const stripeFeesCents =
        definition.monthlyPriceCents * (0.029 + 0.007) + 30;
      const maximumProviderCostCents =
        definition.limits.aiCreditsPerMonth / 10;
      const contributionCents =
        definition.monthlyPriceCents -
        stripeFeesCents -
        maximumProviderCostCents -
        infrastructureReserveCents[plan];

      expect(contributionCents / definition.monthlyPriceCents).toBeGreaterThan(
        0.6
      );
    }
  });

  it("labels higher and lower plan changes clearly", () => {
    expect(planActionLabel("free", "plus")).toBe("Upgrade to Plus");
    expect(planActionLabel("plus", "pro")).toBe("Upgrade to Pro");
    expect(planActionLabel("pro", "max")).toBe("Upgrade to Max");
    expect(planActionLabel("max", "pro")).toBe("Downgrade to Pro");
    expect(planActionLabel("pro", "plus")).toBe("Downgrade to Plus");
    expect(planActionLabel("plus", "free")).toBe("Downgrade to Free");
    expect(planActionLabel("pro", "pro")).toBe("Manage subscription");
    expect(planActionLabel("free", "free")).toBe("Current plan");
  });
});
