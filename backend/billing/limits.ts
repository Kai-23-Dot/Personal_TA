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

function startOfTodayUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function sevenDaysAgo(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

async function currentUsage(userId: string, feature: GatedFeature): Promise<number> {
  const supabase = createServiceClient();

  if (feature === "practice_test") {
    const { count } = await supabase
      .from("practice_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", sevenDaysAgo());
    return count ?? 0;
  }

  if (feature === "note") {
    const { count } = await supabase
      .from("notes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", sevenDaysAgo());
    return count ?? 0;
  }

  // tokens: sum today's token events
  const { data } = await supabase
    .from("usage_events")
    .select("amount")
    .eq("user_id", userId)
    .eq("kind", "tokens")
    .gte("created_at", startOfTodayUtc());
  return (data ?? []).reduce((sum, row) => sum + (row.amount ?? 0), 0);
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
  const plan = await getUserPlan(userId);
  const limits = PLAN_LIMITS[plan];
  if (limits === null) return { ok: true }; // Pro / unlimited

  const limit = limitFor(limits, feature);
  const used = await currentUsage(userId, feature);

  if (used >= limit) {
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
  const plan = await getUserPlan(userId);
  const [practiceTests, notes, tokens] = await Promise.all([
    currentUsage(userId, "practice_test"),
    currentUsage(userId, "note"),
    currentUsage(userId, "tokens"),
  ]);
  return { plan, limits: PLAN_LIMITS[plan], usage: { practiceTests, notes, tokens } };
}

/** Fire-and-forget usage record. Must never throw into the caller. */
export async function recordUsage(userId: string, kind: GatedFeature, amount: number): Promise<void> {
  try {
    if (!userId || amount <= 0) return;
    const supabase = createServiceClient();
    await supabase.from("usage_events").insert({ user_id: userId, kind, amount });
  } catch (err) {
    console.error("[billing] recordUsage failed:", err);
  }
}
