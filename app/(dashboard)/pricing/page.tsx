"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/backend/utils";
import { Card } from "@/frontend/components/ui/card";
import { Button } from "@/frontend/components/ui/button";
import { Badge } from "@/frontend/components/ui/badge";
import {
  formatMonthlyPrice,
  planActionLabel,
  PLAN_CATALOG,
  PLAN_IDS,
  PLAN_RANK,
  type PaidPlan,
  type Plan,
  type PlanLimits,
} from "@/backend/billing/plans";

type BillingStatus = {
  plan: Plan;
  limits: PlanLimits;
};

function planFeatures(plan: Plan): string[] {
  const limits = PLAN_CATALOG[plan].limits;
  const storage =
    limits.storageMegabytes >= 1_024
      ? `${limits.storageMegabytes / 1_024} GB file storage`
      : `${limits.storageMegabytes} MB file storage`;
  return [
    `${limits.aiCreditsPerMonth.toLocaleString()} AI credits per month`,
    `${limits.practiceTestsPerMonth.toLocaleString()} practice tests per month`,
    `${limits.notesPerMonth.toLocaleString()} AI-processed notes per month`,
    `${limits.audioMinutesPerMonth.toLocaleString()} audio minutes per month`,
    storage,
    "Canvas sync & study tools",
  ];
}

export default function PricingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [busyPlan, setBusyPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/billing/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (mounted) setBilling(d ?? null);
      })
      .catch(() => {});
    if (typeof window !== "undefined") {
      const checkout = new URLSearchParams(window.location.search).get("checkout");
      if (checkout === "cancelled") setError("Checkout cancelled — you can upgrade any time.");
    }
    return () => {
      mounted = false;
    };
  }, []);

  async function handlePlanAction(plan: Plan) {
    setBusyPlan(plan);
    setError(null);
    try {
      const opensPortal = plan === "free" || plan === currentPlan;
      const res = await fetch(
        opensPortal ? "/api/billing/portal" : "/api/billing/checkout",
        {
          method: "POST",
          ...(opensPortal
            ? {}
            : {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan: plan as PaidPlan }),
              }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data?.url) {
        setError(data?.error || "Could not start checkout. Please try again.");
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyPlan(null);
    }
  }

  const currentPlan = billing?.plan ?? "free";

  return (
    <div className="mx-auto max-w-7xl pb-16 pt-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Choose your plan</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Pick the monthly allowance that matches how you study. Upgrade, downgrade, or cancel any time.
      </p>

      {error ? (
        <p className="mx-auto mt-4 max-w-md text-sm text-rose-400">{error}</p>
      ) : null}

      <div className="mt-8 grid gap-5 text-left sm:grid-cols-2 xl:grid-cols-4">
        {PLAN_IDS.map((plan) => {
          const definition = PLAN_CATALOG[plan];
          const isCurrent = currentPlan === plan;
          const isUpgrade = PLAN_RANK[plan] > PLAN_RANK[currentPlan];
          return (
            <PlanCard
              key={plan}
              name={definition.name}
              description={definition.description}
              price={formatMonthlyPrice(definition.monthlyPriceCents)}
              cadence={plan === "free" ? "forever" : "per month"}
              features={planFeatures(plan)}
              highlighted={Boolean(definition.highlighted || isCurrent)}
              badge={definition.highlighted ? "Most popular" : undefined}
              action={
                <Button
                  variant={isUpgrade ? "default" : "secondary"}
                  className="w-full"
                  disabled={
                    (isCurrent && plan === "free") || busyPlan !== null
                  }
                  onClick={() => handlePlanAction(plan)}
                >
                  {busyPlan === plan
                    ? "Redirecting…"
                    : planActionLabel(currentPlan, plan)}
                </Button>
              }
            />
          );
        })}
      </div>
      <p className="mx-auto mt-6 max-w-2xl text-xs leading-relaxed text-muted-foreground">
        AI credits are cost-weighted across tutor chat, practice generation, summaries, vision, and audio processing.
        Allowances reset over a rolling 30-day period.
      </p>
    </div>
  );
}

function PlanCard({
  name,
  description,
  price,
  cadence,
  features,
  highlighted,
  badge,
  action,
}: {
  name: string;
  description: string;
  price: string;
  cadence: string;
  features: string[];
  highlighted: boolean;
  badge?: string;
  action: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "flex flex-col gap-4 p-7",
        highlighted && "border-sky-400/40 shadow-[0_0_0_1px_rgba(56,189,248,0.15),0_20px_60px_rgba(56,189,248,0.08)]"
      )}
    >
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-foreground">{name}</h3>
          {badge ? <Badge variant="info">{badge}</Badge> : null}
        </div>
        <div className="mt-1.5">
          <span className="text-3xl font-bold text-foreground">{price}</span>
          <span className="ml-1.5 text-sm text-muted-foreground">{cadence}</span>
        </div>
        <p className="mt-3 min-h-10 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <ul className="grid flex-1 gap-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 flex-shrink-0 text-sky-400" /> {f}
          </li>
        ))}
      </ul>
      {action}
    </Card>
  );
}
