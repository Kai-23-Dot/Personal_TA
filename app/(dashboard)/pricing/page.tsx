"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/backend/utils";
import { Card } from "@/frontend/components/ui/card";
import { Button } from "@/frontend/components/ui/button";
import { Badge } from "@/frontend/components/ui/badge";

type BillingStatus = {
  plan: "free" | "pro";
  limits: { practiceTestsPerWeek: number; notesPerWeek: number; tokensPerDay: number } | null;
  usage: { practiceTests: number; notes: number; tokens: number };
};

const FREE_FEATURES = [
  "2 practice tests per week",
  "3 notes uploads per week",
  "50,000 AI tokens per day",
  "Canvas sync & study tools",
];

const PRO_FEATURES = [
  "Unlimited practice tests",
  "Unlimited note uploads",
  "Unlimited AI tokens",
  "Everything in Free",
];

export default function PricingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState(false);
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

  async function handleUpgrade() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        setError(data?.error || "Could not start checkout. Please try again.");
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const isPro = billing?.plan === "pro";

  return (
    <div className="mx-auto max-w-3xl pb-16 pt-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Choose your plan</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Upgrade to Pro for unlimited practice, notes, and AI.
      </p>

      {error ? (
        <p className="mx-auto mt-4 max-w-md text-sm text-rose-400">{error}</p>
      ) : null}

      <div className="mt-8 grid gap-6 text-left sm:grid-cols-2">
        <PlanCard
          name="Free"
          price="$0"
          cadence="forever"
          features={FREE_FEATURES}
          highlighted={!isPro}
          action={
            <Button variant="secondary" className="w-full" disabled>
              {isPro ? "Included" : "Current plan"}
            </Button>
          }
        />

        <PlanCard
          name="Pro"
          price="$20"
          cadence="per month"
          features={PRO_FEATURES}
          highlighted={isPro}
          badge="Most popular"
          action={
            isPro ? (
              <Button variant="secondary" className="w-full" disabled>
                Current plan
              </Button>
            ) : (
              <Button className="w-full" disabled={busy} onClick={handleUpgrade}>
                {busy ? "Redirecting…" : "Upgrade to Pro"}
              </Button>
            )
          }
        />
      </div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  cadence,
  features,
  highlighted,
  badge,
  action,
}: {
  name: string;
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
