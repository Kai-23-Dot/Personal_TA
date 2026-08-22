import { getLocalAdminMetrics } from "./localMetrics";
import { getOpenAIAdminMetrics } from "./openaiMetrics";
import { getStripeAdminMetrics } from "./stripeMetrics";
import type { AdminOverviewResponse, AdminPeriodDays } from "./types";

export const ADMIN_PERIODS: readonly AdminPeriodDays[] = [1, 7, 30, 90];

export function parseAdminPeriod(value: string | null): AdminPeriodDays {
  const candidate = Number(value);
  return ADMIN_PERIODS.includes(candidate as AdminPeriodDays)
    ? (candidate as AdminPeriodDays)
    : 30;
}

export async function getAdminOverview(days: AdminPeriodDays): Promise<AdminOverviewResponse> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const startTime = Math.floor(start.getTime() / 1_000);
  const endTime = Math.floor(end.getTime() / 1_000);

  const [openai, stripe, local] = await Promise.all([
    getOpenAIAdminMetrics({ startTime, endTime, days }),
    getStripeAdminMetrics({ startTime, endTime }),
    getLocalAdminMetrics({ startIso: start.toISOString(), endIso: end.toISOString() }),
  ]);

  const hasStripeNet = stripe.configured && !stripe.error;
  const hasActualOpenAiCost = openai.configured && !openai.error;
  const providerCostCents = hasActualOpenAiCost && openai.costUsd !== null
    ? Math.round(openai.costUsd * 100)
    : null;
  const contributionCostBasis = hasStripeNet && hasActualOpenAiCost
    ? "openai-actual" as const
    : null;

  return {
    generatedAt: end.toISOString(),
    period: { days, start: start.toISOString(), end: end.toISOString() },
    openai,
    stripe,
    local,
    estimatedContributionCents: hasStripeNet && providerCostCents !== null && stripe.netVolumeCents !== null
      ? stripe.netVolumeCents - providerCostCents
      : null,
    contributionCostBasis,
  };
}
