import { createServiceClient } from "@/backend/supabase/server";
import { isPlan, type Plan } from "@/backend/billing/plans";
import type { LocalAdminMetrics } from "./types";

type UsageRow = { kind: string; amount: number | null; created_at: string };

const PAGE_SIZE = 1_000;

async function countRows(
  table: "profiles" | "lms_connections" | "courses" | "practice_sessions" | "notes"
): Promise<number> {
  const supabase = createServiceClient();
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(`[admin] Could not count ${table}`, { cause: error });
  return count ?? 0;
}

async function usageRows(startIso: string, endIso: string): Promise<UsageRow[]> {
  const supabase = createServiceClient();
  const rows: UsageRow[] = [];

  for (let page = 0; page < 100; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("usage_events")
      .select("kind, amount, created_at")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("[admin] Could not load local usage", { cause: error });
    const pageRows = (data ?? []) as UsageRow[];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
  }
  return rows;
}

async function profilePlans(): Promise<Array<{ plan: string | null; subscription_status: string | null }>> {
  const supabase = createServiceClient();
  const rows: Array<{ plan: string | null; subscription_status: string | null }> = [];
  for (let page = 0; page < 100; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from("profiles")
      .select("plan, subscription_status")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("[admin] Could not load account plans", { cause: error });
    const pageRows = data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function getLocalAdminMetrics({
  startIso,
  endIso,
}: {
  startIso: string;
  endIso: string;
}): Promise<LocalAdminMetrics> {
  const [
    totalUsers,
    newUsersResult,
    connectedLmsResult,
    activeCoursesResult,
    practiceSessionsResult,
    notesCreatedResult,
    usage,
    profiles,
  ] = await Promise.all([
    countRows("profiles"),
    createServiceClient().from("profiles").select("id", { count: "exact", head: true }).gte("created_at", startIso).lt("created_at", endIso),
    createServiceClient().from("lms_connections").select("id", { count: "exact", head: true }).eq("is_active", true),
    createServiceClient().from("courses").select("id", { count: "exact", head: true }).eq("is_active", true),
    createServiceClient().from("practice_sessions").select("id", { count: "exact", head: true }).gte("created_at", startIso).lt("created_at", endIso),
    createServiceClient().from("notes").select("id", { count: "exact", head: true }).gte("created_at", startIso).lt("created_at", endIso),
    usageRows(startIso, endIso),
    profilePlans(),
  ]);

  for (const [label, result] of [
    ["new users", newUsersResult],
    ["LMS connections", connectedLmsResult],
    ["active courses", activeCoursesResult],
    ["practice sessions", practiceSessionsResult],
    ["notes", notesCreatedResult],
  ] as const) {
    if (result.error) throw new Error(`[admin] Could not count ${label}`, { cause: result.error });
  }
  const newUsers = newUsersResult.count ?? 0;
  const connectedLmsAccounts = connectedLmsResult.count ?? 0;
  const activeCourses = activeCoursesResult.count ?? 0;
  const practiceSessions = practiceSessionsResult.count ?? 0;
  const notesCreated = notesCreatedResult.count ?? 0;

  const planDistribution: Record<Plan, number> = { free: 0, plus: 0, pro: 0, max: 0 };
  let paidUsers = 0;
  for (const profile of profiles) {
    const plan = isPlan(profile.plan) ? profile.plan : "free";
    const paid = plan !== "free" && ["active", "trialing"].includes(profile.subscription_status ?? "");
    planDistribution[paid ? plan : "free"] += 1;
    if (paid) paidUsers += 1;
  }

  const dailyMap = new Map<string, { date: string; localTokens: number; localAiCredits: number }>();
  let localTokens = 0;
  let localAiCredits = 0;
  let audioSeconds = 0;
  for (const event of usage) {
    const amount = Number(event.amount ?? 0);
    if (!Number.isFinite(amount)) continue;
    const date = event.created_at.slice(0, 10);
    const day = dailyMap.get(date) ?? { date, localTokens: 0, localAiCredits: 0 };
    if (event.kind === "tokens") {
      localTokens += amount;
      day.localTokens += amount;
    } else if (event.kind === "ai_credits") {
      localAiCredits += amount;
      day.localAiCredits += amount;
    } else if (event.kind === "audio_seconds") {
      audioSeconds += amount;
    }
    dailyMap.set(date, day);
  }

  return {
    totalUsers,
    newUsers,
    paidUsers,
    connectedLmsAccounts,
    activeCourses,
    practiceSessions,
    notesCreated,
    localTokens,
    localAiCredits,
    audioSeconds,
    planDistribution,
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
