/**
 * Plan definitions, usage-limit checks, and usage recording.
 *
 * Rolling monthly counts (practice tests, notes) are derived from the existing
 * practice_sessions / notes tables to avoid a separate counter that could
 * drift. AI credits and audio seconds are summed from usage_events.
 * All reads/writes use the service-role client so they work inside AI
 * middleware and webhooks where request context may be absent.
 */
import { createServiceClient } from "@/backend/supabase/server";
import {
  isPlan,
  PLAN_CATALOG,
  type Plan,
  type PlanLimits,
} from "@/backend/billing/plans";

export type GatedFeature =
  | "practice_test"
  | "note"
  | "ai_credits"
  | "audio_seconds"
  | "storage_bytes";

export type UsageKind = GatedFeature | "tokens";

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: PLAN_CATALOG.free.limits,
  plus: PLAN_CATALOG.plus.limits,
  pro: PLAN_CATALOG.pro.limits,
  max: PLAN_CATALOG.max.limits,
};

/** Conservative per-model-call reservation; unused credits are refunded. */
export const AI_CREDIT_RESERVATION = 25;

export class UsageLimitError extends Error {
  readonly code = "LIMIT_REACHED";

  constructor(message: string) {
    super(message);
    this.name = "UsageLimitError";
  }
}

/** Subscription statuses that grant access to a paid plan. */
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export type LimitResult =
  | { ok: true }
  | { ok: false; feature: GatedFeature; limit: number; used: number; reason: string };

/** Resolve a user's effective plan. Paid tiers count only while the subscription is active. */
export async function getUserPlan(userId: string): Promise<Plan> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("profiles")
    .select("plan, subscription_status")
    .eq("id", userId)
    .single();

  if (
    isPlan(data?.plan) &&
    data.plan !== "free" &&
    ACTIVE_STATUSES.has(data?.subscription_status ?? "")
  ) {
    return data.plan;
  }
  return "free";
}

interface BillingUsageSnapshot {
  plan: Plan;
  practiceTests: number;
  notes: number;
  aiCredits: number;
  audioSeconds: number;
  storageBytes: number;
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
    plan: isPlan(row.effective_plan) ? row.effective_plan : "free",
    practiceTests: Number(row.practice_tests ?? 0),
    notes: Number(row.notes ?? 0),
    aiCredits: Number(row.ai_credits ?? 0),
    audioSeconds: Number(row.audio_seconds ?? 0),
    storageBytes: Number(row.storage_bytes ?? 0),
  };
}

function limitFor(limits: PlanLimits, feature: GatedFeature): number {
  switch (feature) {
    case "practice_test":
      return limits.practiceTestsPerMonth;
    case "note":
      return limits.notesPerMonth;
    case "ai_credits":
      return limits.aiCreditsPerMonth;
    case "audio_seconds":
      return limits.audioMinutesPerMonth * 60;
    case "storage_bytes":
      return limits.storageMegabytes * 1024 * 1024;
  }
}

/**
 * Check whether `userId` may perform `feature`. Call this before starting the
 * work or creating the counted record.
 */
export async function assertWithinLimit(
  userId: string,
  feature: GatedFeature,
  requestedAmount?: number
): Promise<LimitResult> {
  return assertWithinLimits(
    userId,
    [feature],
    requestedAmount === undefined ? {} : { [feature]: requestedAmount }
  );
}

/** Check several limits from one consistent database usage snapshot. */
export async function assertWithinLimits(
  userId: string,
  features: readonly GatedFeature[],
  requestedAmounts: Partial<Record<GatedFeature, number>> = {}
): Promise<LimitResult> {
  const snapshot = await billingUsageSnapshot(userId);
  const limits = PLAN_LIMITS[snapshot.plan];

  for (const feature of features) {
    const limit = limitFor(limits, feature);
    const used =
      feature === "practice_test"
        ? snapshot.practiceTests
        : feature === "note"
        ? snapshot.notes
        : feature === "ai_credits"
        ? snapshot.aiCredits
        : feature === "audio_seconds"
        ? snapshot.audioSeconds
        : snapshot.storageBytes;
    const requested =
      requestedAmounts[feature] ??
      (feature === "ai_credits"
        ? AI_CREDIT_RESERVATION
        : feature === "practice_test" || feature === "note"
        ? 1
        : 0);
    if (used + requested <= limit) continue;
    const label =
      feature === "practice_test"
        ? "practice tests this month"
        : feature === "note"
        ? "AI-processed notes this month"
        : feature === "ai_credits"
        ? "monthly AI credits"
        : feature === "audio_seconds"
        ? "audio transcription this month"
        : "file storage";
    return {
      ok: false,
      feature,
      limit,
      used,
      reason: `You've reached your ${PLAN_CATALOG[snapshot.plan].name} plan limit for ${label}. Choose a higher plan to continue.`,
    };
  }
  return { ok: true };
}

export interface UsageSummary {
  plan: Plan;
  limits: PlanLimits;
  usage: {
    practiceTests: number;
    notes: number;
    aiCredits: number;
    audioSeconds: number;
    storageBytes: number;
  };
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
      aiCredits: snapshot.aiCredits,
      audioSeconds: snapshot.audioSeconds,
      storageBytes: snapshot.storageBytes,
    },
  };
}

/** Persist a usage record. Errors are logged but never thrown into the caller. */
export async function recordUsage(
  userId: string,
  kind: UsageKind,
  amount: number,
  { allowAdjustment = false }: { allowAdjustment?: boolean } = {}
): Promise<void> {
  try {
    if (!userId || amount === 0 || (!allowAdjustment && amount < 0)) return;
    const supabase = createServiceClient();
    const { error } = await supabase
      .from("usage_events")
      .insert({ user_id: userId, kind, amount });
    if (error) throw error;
  } catch (err) {
    console.error("[billing] recordUsage failed:", err);
  }
}

export async function reserveAiCredits(
  userId: string,
  amount = AI_CREDIT_RESERVATION
): Promise<void> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("reserve_ai_credits", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) {
    throw new Error("[billing] Could not reserve AI credits", { cause: error });
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.allowed) {
    const candidatePlan: unknown = row?.effective_plan;
    const effectivePlan = isPlan(candidatePlan) ? candidatePlan : "free";
    throw new UsageLimitError(
      `You've reached your ${PLAN_CATALOG[effectivePlan].name} plan's monthly AI allowance.`
    );
  }
}

export async function settleAiCreditReservation(
  userId: string,
  reserved: number,
  actual: number
): Promise<void> {
  const adjustment = Math.max(0, actual) - reserved;
  if (adjustment === 0) return;
  await recordUsage(userId, "ai_credits", adjustment, {
    allowAdjustment: true,
  });
}
