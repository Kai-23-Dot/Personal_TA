export const PLAN_IDS = ["free", "plus", "pro", "max"] as const;

export type Plan = (typeof PLAN_IDS)[number];
export type PaidPlan = Exclude<Plan, "free">;

export interface PlanLimits {
  practiceTestsPerMonth: number;
  notesPerMonth: number;
  aiCreditsPerMonth: number;
  audioMinutesPerMonth: number;
  storageMegabytes: number;
}

export interface PlanDefinition {
  id: Plan;
  name: string;
  monthlyPriceCents: number;
  limits: PlanLimits;
  description: string;
  highlighted?: boolean;
}

/**
 * One AI credit represents at most $0.001 of metered provider spend. Limits
 * reset over a rolling 30-day window, including Free accounts.
 */
export const PLAN_CATALOG: Record<Plan, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPriceCents: 0,
    description: "Try Smartlearn with a limited monthly AI allowance.",
    limits: {
      practiceTestsPerMonth: 2,
      notesPerMonth: 5,
      aiCreditsPerMonth: 100,
      audioMinutesPerMonth: 3,
      storageMegabytes: 100,
    },
  },
  plus: {
    id: "plus",
    name: "Plus",
    monthlyPriceCents: 499,
    description: "For lighter weekly study across a few classes.",
    limits: {
      practiceTestsPerMonth: 20,
      notesPerMonth: 40,
      aiCreditsPerMonth: 600,
      audioMinutesPerMonth: 20,
      storageMegabytes: 512,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPriceCents: 1_999,
    description: "A generous allowance for daily study and exam prep.",
    highlighted: true,
    limits: {
      practiceTestsPerMonth: 100,
      notesPerMonth: 150,
      aiCreditsPerMonth: 3_000,
      audioMinutesPerMonth: 120,
      storageMegabytes: 3_072,
    },
  },
  max: {
    id: "max",
    name: "Max",
    monthlyPriceCents: 2_999,
    description: "For intensive workloads across several courses.",
    limits: {
      practiceTestsPerMonth: 250,
      notesPerMonth: 350,
      aiCreditsPerMonth: 8_000,
      audioMinutesPerMonth: 360,
      storageMegabytes: 10_240,
    },
  },
};

export const PAID_PLAN_IDS: PaidPlan[] = ["plus", "pro", "max"];

export const PLAN_RANK: Record<Plan, number> = {
  free: 0,
  plus: 1,
  pro: 2,
  max: 3,
};

export function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function isPaidPlan(value: unknown): value is PaidPlan {
  return isPlan(value) && value !== "free";
}

export function formatMonthlyPrice(cents: number): string {
  if (cents === 0) return "$0";
  return `$${(cents / 100).toFixed(2)}`;
}

export function planActionLabel(currentPlan: Plan, targetPlan: Plan): string {
  if (currentPlan === targetPlan) {
    return targetPlan === "free" ? "Current plan" : "Manage subscription";
  }
  const direction =
    PLAN_RANK[targetPlan] > PLAN_RANK[currentPlan] ? "Upgrade" : "Downgrade";
  return `${direction} to ${PLAN_CATALOG[targetPlan].name}`;
}
