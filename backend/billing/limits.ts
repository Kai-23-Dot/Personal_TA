/**
 * Plan definitions, usage-limit checks, and usage recording.
 *
 * Weekly counts (practice tests, notes) are derived from the existing
 * practice_sessions / notes tables to avoid a separate counter that could
 * drift. Daily token usage is summed from usage_events (kind='tokens').
 * All reads/writes use the service-role client so they work inside AI
 * middleware and webhooks where request context may be absent.
 */
import { createServiceClient } from "@/backend/supabase/server";

export type Plan = "free" | "pro";
export type GatedFeature = "practice_test" | "note" | "tokens";

export interface PlanLimits {
  practiceTestsPerWeek: number;
  notesPerWeek: number;
  tokensPerDay: number;
}

/** null limits = unlimited. */
export const PLAN_LIMITS: Record<Plan, PlanLimits | null> = {
  free: { practiceTestsPerWeek: 2, notesPerWeek: 3, tokensPerDay: 50_000 },
  pro: null,
};

/** Subscription statuses that grant Pro access. */
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export type LimitResult =
  | { ok: true }
  | { ok: false; feature: GatedFeature; limit: number; used: number; reason: string };

/** Resolve a user's effective plan. Pro only counts when the subscription is active. */
export async function getUserPlan(userId: string): Promise<Plan> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("profiles")
    .select("plan, subscription_status")
    .eq("id", userId)
    .single();

  if (data?.plan === "pro" && ACTIVE_STATUSES.has(data?.subscription_status ?? "")) {
    return "pro";
  }
  return "free";
}

interface BillingUsageSnapshot {
  plan: Plan;
  practiceTests: number;
  notes: number;
  tokens: number;
}

async function billingUsageSnapshot(userId: string): Promise<BillingUsageSnapshot> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("get_billing_usage", {
    p_user_id: userId,
  });
  if (error) {
    throw new Error("[billing] Could not load usage", { cause: error });
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("[billing] Billing profile was not found");

  return {
    plan: row.effective_plan === "pro" ? "pro" : "free",
    practiceTests: Number(row.practice_tests ?? 0),
    notes: Number(row.notes ?? 0),
    tokens: Number(row.tokens ?? 0),
  };
}

function limitFor(limits: PlanLimits, feature: GatedFeature): number {
  switch (feature) {
    case "practice_test":
      return limits.practiceTestsPerWeek;
    case "note":
      return limits.notesPerWeek;
    case "tokens":
      return limits.tokensPerDay;
  }
}

/**
 * Check whether `userId` may perform `feature`. Pro users are always allowed.
 * For counted features (practice_test / note) the check is "is the user already
 * at or above the limit" — call it before creating the new record.
 */
export async function assertWithinLimit(userId: string, feature: GatedFeature): Promise<LimitResult> {
  return assertWithinLimits(userId, [feature]);
}

/** Check several limits from one consistent database usage snapshot. */
export async function assertWithinLimits(
  userId: string,
  features: readonly GatedFeature[]
): Promise<LimitResult> {
  const snapshot = await billingUsageSnapshot(userId);
  const limits = PLAN_LIMITS[snapshot.plan];
  if (limits === null) return { ok: true }; // Pro / unlimited

  for (const feature of features) {
    const limit = limitFor(limits, feature);
    const used =
      feature === "practice_test"
        ? snapshot.practiceTests
        : feature === "note"
        ? snapshot.notes
        : snapshot.tokens;
    if (used < limit) continue;
    const label =
      feature === "practice_test"
        ? "practice tests this week"
        : feature === "note"
        ? "notes this week"
        : "daily AI usage";
    return {
      ok: false,
      feature,
      limit,
      used,
      reason: `You've reached the Free plan limit for ${label}. Upgrade to Pro for unlimited access.`,
    };
  }
  return { ok: true };
}

export interface UsageSummary {
  plan: Plan;
  limits: PlanLimits | null; // null = unlimited (Pro)
  usage: { practiceTests: number; notes: number; tokens: number };
}

/** Current plan + usage numbers for the billing UI. */
export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const snapshot = await billingUsageSnapshot(userId);
  return {
    plan: snapshot.plan,
    limits: PLAN_LIMITS[snapshot.plan],
    usage: {
      practiceTests: snapshot.practiceTests,
      notes: snapshot.notes,
      tokens: snapshot.tokens,
    },
  };
}

/** Persist a usage record. Errors are logged but never thrown into the caller. */
export async function recordUsage(userId: string, kind: GatedFeature, amount: number): Promise<void> {
  try {
    if (!userId || amount <= 0) return;
    const supabase = createServiceClient();
    const { error } = await supabase
      .from("usage_events")
      .insert({ user_id: userId, kind, amount });
    if (error) throw error;
  } catch (err) {
    console.error("[billing] recordUsage failed:", err);
  }
}
