import type { Plan } from "@/backend/billing/plans";

export type AdminPeriodDays = 1 | 7 | 30 | 90;

export interface DailyAdminMetric {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  requests: number;
  providerCostUsd: number;
  localTokens: number;
  localAiCredits: number;
}

export interface OpenAIModelMetric {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  requests: number;
}

export interface OpenAICostLineItem {
  lineItem: string;
  amountUsd: number;
}

export interface OpenAIAdminMetrics {
  configured: boolean;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  requests: number | null;
  embeddingTokens: number | null;
  imageRequests: number | null;
  audioSeconds: number | null;
  costUsd: number | null;
  models: OpenAIModelMetric[];
  costLineItems: OpenAICostLineItem[];
  daily: Omit<DailyAdminMetric, "localTokens" | "localAiCredits">[];
}

export interface StripeTransactionMetric {
  id: string;
  createdAt: string;
  description: string;
  type: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
}

export interface StripeAdminMetrics {
  configured: boolean;
  error: string | null;
  currency: string | null;
  grossVolumeCents: number | null;
  refundsCents: number | null;
  disputesCents: number | null;
  feesCents: number | null;
  netVolumeCents: number | null;
  mrrCents: number | null;
  availableBalanceCents: number | null;
  pendingBalanceCents: number | null;
  activeSubscriptions: number | null;
  trialingSubscriptions: number | null;
  pastDueSubscriptions: number | null;
  canceledSubscriptions: number | null;
  recentTransactions: StripeTransactionMetric[];
  additionalCurrencies: string[];
}

export interface LocalAdminMetrics {
  totalUsers: number;
  newUsers: number;
  paidUsers: number;
  connectedLmsAccounts: number;
  activeCourses: number;
  practiceSessions: number;
  notesCreated: number;
  localTokens: number;
  localAiCredits: number;
  audioSeconds: number;
  planDistribution: Record<Plan, number>;
  daily: Array<{ date: string; localTokens: number; localAiCredits: number }>;
}

export interface AdminOverviewResponse {
  generatedAt: string;
  period: { days: AdminPeriodDays; start: string; end: string };
  openai: OpenAIAdminMetrics;
  stripe: StripeAdminMetrics;
  local: LocalAdminMetrics;
  estimatedContributionCents: number | null;
  contributionCostBasis: "openai-actual" | "smartlearn-metered-estimate" | null;
}
