"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Banknote,
  Bot,
  BrainCircuit,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Database,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import type { AdminOverviewResponse, AdminPeriodDays } from "@/backend/admin/types";
import { PageHero } from "@/frontend/components/ui/page-hero";
import { Card } from "@/frontend/components/ui/card";
import { cn } from "@/backend/utils";

const PERIODS: Array<{ value: AdminPeriodDays; label: string }> = [
  { value: 1, label: "24H" },
  { value: 7, label: "7D" },
  { value: 30, label: "30D" },
  { value: 90, label: "90D" },
];

function moneyFromCents(value: number | null, currency = "USD") {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function moneyFromDollars(value: number | null) {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function compact(value: number | null) {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "sky",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  tone?: "sky" | "emerald" | "violet" | "amber";
}) {
  const tones = {
    sky: "border-sky-400/20 bg-sky-400/[0.07] text-sky-200",
    emerald: "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200",
    violet: "border-violet-400/20 bg-violet-400/[0.07] text-violet-200",
    amber: "border-amber-400/20 bg-amber-400/[0.07] text-amber-200",
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{detail}</p>
        </div>
        <span className={cn("rounded-xl border p-2.5", tones[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading owner analytics">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="h-36 animate-pulse rounded-2xl border border-white/8 bg-white/[0.035]" />
      ))}
    </div>
  );
}

export function AdminDashboard() {
  const [period, setPeriod] = useState<AdminPeriodDays>(30);
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadOverview = useCallback(async (signal?: AbortSignal) => {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/admin/overview?days=${period}`, {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("Owner analytics are temporarily unavailable.");
      setOverview((await response.json()) as AdminOverviewResponse);
      setError(null);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Owner analytics are temporarily unavailable.");
    } finally {
      if (!signal?.aborted) setRefreshing(false);
    }
  }, [period]);

  useEffect(() => {
    const controller = new AbortController();
    void loadOverview(controller.signal);
    const interval = window.setInterval(() => void loadOverview(), 60_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [loadOverview]);

  const tokenSeries = useMemo(() => {
    if (!overview) return [];
    if (overview.openai.configured && !overview.openai.error) {
      return overview.openai.daily.map((day) => ({
        date: day.date,
        value: day.inputTokens + day.outputTokens,
      }));
    }
    return overview.local.daily.map((day) => ({ date: day.date, value: day.localTokens }));
  }, [overview]);
  const maxTokenDay = Math.max(1, ...tokenSeries.map((day) => day.value));

  const providerCost = overview?.openai.configured && !overview.openai.error
    ? overview.openai.costUsd
    : null;
  const providerCostDetail = overview?.openai.configured && !overview.openai.error
    ? "Actual organization cost from OpenAI"
    : "Connect OPENAI_ADMIN_KEY to show actual provider cost";

  return (
    <div className="mx-auto max-w-[1500px] px-1 pb-16 pt-1 sm:px-2">
      <PageHero
        className="mb-6"
        icon={ShieldCheck}
        badgeLabel="Owner access only"
        title="Business control room"
        description="Private provider, revenue, usage, and product health analytics. This route and its data API are protected by the server-side owner allowlist."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full border border-white/10 bg-black/20 p-1">
              {PERIODS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setPeriod(item.value)}
                  className={cn(
                    "rounded-full px-3 py-1.5 font-mono text-[10px] font-semibold transition",
                    period === item.value
                      ? "bg-sky-300 text-slate-950"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void loadOverview()}
              disabled={refreshing}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs text-muted-foreground transition hover:border-sky-300/30 hover:text-sky-100 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              Refresh
            </button>
          </div>
        }
      />

      {error ? (
        <Card className="mb-6 border-rose-400/25 bg-rose-400/[0.06] p-4 text-sm text-rose-100">
          {error} Your existing data remains unchanged; retry in a moment.
        </Card>
      ) : null}

      {!overview ? <LoadingState /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Gross volume"
              value={overview.stripe.configured && !overview.stripe.error ? moneyFromCents(overview.stripe.grossVolumeCents) : "Unavailable"}
              detail={`Stripe payments in the last ${overview.period.days} day${overview.period.days === 1 ? "" : "s"}`}
              icon={CircleDollarSign}
              tone="emerald"
            />
            <MetricCard
              label="Stripe net receipts"
              value={overview.stripe.configured && !overview.stripe.error ? moneyFromCents(overview.stripe.netVolumeCents) : "Unavailable"}
              detail={`${moneyFromCents(overview.stripe.feesCents)} fees · ${moneyFromCents(overview.stripe.refundsCents)} refunds`}
              icon={WalletCards}
              tone="sky"
            />
            <MetricCard
              label="AI provider cost"
              value={moneyFromDollars(providerCost)}
              detail={providerCostDetail}
              icon={Bot}
              tone="violet"
            />
            <MetricCard
              label="Estimated contribution"
              value={moneyFromCents(overview.estimatedContributionCents)}
              detail="Stripe net minus OpenAI cost; not accounting profit"
              icon={TrendingUp}
              tone={overview.estimatedContributionCents !== null && overview.estimatedContributionCents >= 0 ? "emerald" : "amber"}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Monthly recurring revenue" value={overview.stripe.configured && !overview.stripe.error ? moneyFromCents(overview.stripe.mrrCents) : "Unavailable"} detail={overview.stripe.configured && !overview.stripe.error ? `${overview.stripe.activeSubscriptions} active · ${overview.stripe.trialingSubscriptions} trialing` : "Connect Stripe to show subscription revenue"} icon={Banknote} tone="emerald" />
            <MetricCard label="Accounts" value={compact(overview.local.totalUsers)} detail={`${overview.local.newUsers} new · ${overview.local.paidUsers} paid in view`} icon={Users} />
            <MetricCard label="In-app tokens" value={compact(overview.local.localTokens)} detail={`${compact(overview.local.localAiCredits)} metered credits`} icon={BrainCircuit} tone="violet" />
            <MetricCard label="Product activity" value={compact(overview.local.practiceSessions + overview.local.notesCreated)} detail={`${overview.local.practiceSessions} practice · ${overview.local.notesCreated} notes`} icon={Activity} tone="amber" />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <Card className="overflow-hidden p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-sky-300">Token activity</p>
                  <h2 className="mt-2 text-xl font-semibold text-foreground">Provider usage over time</h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  {overview.openai.configured && !overview.openai.error ? "OpenAI organization data" : "Smartlearn metering data"}
                </p>
              </div>
              {tokenSeries.length > 0 ? (
                <div className="mt-8 flex h-48 items-end gap-1.5" aria-label="Daily token usage chart">
                  {tokenSeries.map((day) => (
                    <div key={day.date} className="group relative flex h-full min-w-0 flex-1 items-end">
                      <div
                        className="w-full rounded-t-sm bg-gradient-to-t from-sky-500/35 to-violet-400/80 transition group-hover:from-sky-400/55 group-hover:to-violet-300"
                        style={{ height: `${Math.max(3, (day.value / maxTokenDay) * 100)}%` }}
                      />
                      <span className="pointer-events-none absolute bottom-[calc(100%+0.4rem)] left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-slate-950 px-2 py-1 font-mono text-[9px] text-slate-200 shadow-xl group-hover:block">
                        {day.date} · {compact(day.value)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-6 flex h-48 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] text-sm text-muted-foreground">
                  No token activity in this period.
                </div>
              )}
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/8 pt-5 sm:grid-cols-4">
                <div><p className="text-xs text-muted-foreground">Input</p><p className="mt-1 font-semibold text-foreground">{overview.openai.configured && !overview.openai.error ? compact(overview.openai.inputTokens) : "Unavailable"}</p></div>
                <div><p className="text-xs text-muted-foreground">Output</p><p className="mt-1 font-semibold text-foreground">{overview.openai.configured && !overview.openai.error ? compact(overview.openai.outputTokens) : "Unavailable"}</p></div>
                <div><p className="text-xs text-muted-foreground">Cached</p><p className="mt-1 font-semibold text-foreground">{overview.openai.configured && !overview.openai.error ? compact(overview.openai.cachedTokens) : "Unavailable"}</p></div>
                <div><p className="text-xs text-muted-foreground">Requests</p><p className="mt-1 font-semibold text-foreground">{overview.openai.configured && !overview.openai.error ? compact(overview.openai.requests) : "Unavailable"}</p></div>
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-300">Provider status</p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">Live connections</h2>
              <div className="mt-5 space-y-3">
                <ProviderRow
                  icon={Bot}
                  label="OpenAI organization"
                  ready={overview.openai.configured && !overview.openai.error}
                  detail={!overview.openai.configured ? "Add OPENAI_ADMIN_KEY for exact provider totals" : overview.openai.error ?? "Usage and costs connected"}
                />
                <ProviderRow
                  icon={CreditCard}
                  label="Stripe"
                  ready={overview.stripe.configured && !overview.stripe.error}
                  detail={!overview.stripe.configured ? "Stripe secret key is not configured" : overview.stripe.error ?? "Revenue and balances connected"}
                />
                <ProviderRow icon={Database} label="Smartlearn database" ready detail="Owner-wide product metering connected" />
              </div>
              <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Available balance</span>
                  <span className="text-sm font-semibold text-foreground">{overview.stripe.configured && !overview.stripe.error ? moneyFromCents(overview.stripe.availableBalanceCents) : "Unavailable"}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Pending balance</span>
                  <span className="text-sm font-semibold text-foreground">{overview.stripe.configured && !overview.stripe.error ? moneyFromCents(overview.stripe.pendingBalanceCents) : "Unavailable"}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Past due</span>
                  <span className="text-sm font-semibold text-amber-200">{overview.stripe.configured && !overview.stripe.error ? overview.stripe.pastDueSubscriptions : "Unavailable"}</span>
                </div>
              </div>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Card className="overflow-hidden p-5 sm:p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-violet-300">OpenAI model mix</p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">Tokens by model</h2>
              <div className="mt-5 space-y-2">
                {overview.openai.models.length > 0 ? overview.openai.models.slice(0, 10).map((model) => (
                  <div key={model.model} className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{model.model}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{compact(model.requests)} requests · {compact(model.cachedTokens)} cached</p>
                    </div>
                    <p className="shrink-0 font-mono text-xs text-sky-200">{compact(model.inputTokens + model.outputTokens)} tokens</p>
                  </div>
                )) : (
                  <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">Exact model detail appears after the OpenAI organization admin key is connected.</p>
                )}
              </div>
            </Card>

            <Card className="overflow-hidden p-5 sm:p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-sky-300">Stripe activity</p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">Recent balance transactions</h2>
              <div className="mt-5 space-y-2">
                {overview.stripe.recentTransactions.length > 0 ? overview.stripe.recentTransactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium capitalize text-foreground">{transaction.description}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" /> {new Date(transaction.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("font-mono text-xs", transaction.netCents >= 0 ? "text-emerald-200" : "text-rose-200")}>{moneyFromCents(transaction.netCents, transaction.currency)}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Net</p>
                    </div>
                  </div>
                )) : (
                  <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">No revenue transactions in this period.</p>
                )}
              </div>
            </Card>
          </div>

          <Card className="mt-6 p-5 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-300">Product footprint</p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">Accounts and connected learning data</h2>
              </div>
              <p className="text-xs text-muted-foreground">Auto-refreshes every 60 seconds · Last updated {new Date(overview.generatedAt).toLocaleTimeString()}</p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Footprint label="Free" value={overview.local.planDistribution.free} />
              <Footprint label="Plus" value={overview.local.planDistribution.plus} />
              <Footprint label="Pro" value={overview.local.planDistribution.pro} />
              <Footprint label="Max" value={overview.local.planDistribution.max} />
              <Footprint label="LMS connections" value={overview.local.connectedLmsAccounts} />
            </div>
            <p className="mt-5 text-xs leading-5 text-muted-foreground">
              Estimated contribution is shown only when actual Stripe net activity and actual OpenAI organization cost are available. It is an operating signal, not GAAP profit, and excludes taxes, hosting, payroll, chargebacks outside the selected period, and other business expenses.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function ProviderRow({
  icon: Icon,
  label,
  ready,
  detail,
}: {
  icon: typeof Bot;
  label: string;
  ready: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3.5">
      <span className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-sky-200"><Icon className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <span className={cn("h-2 w-2 rounded-full", ready ? "bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.7)]" : "bg-amber-300")} />
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function Footprint({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{compact(value)}</p>
    </div>
  );
}
