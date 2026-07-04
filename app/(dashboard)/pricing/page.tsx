"use client";

import { useEffect, useState } from "react";

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
    <section className="section">
      <div style={{ maxWidth: "900px", margin: "0 auto", textAlign: "center" }}>
        <h2 className="contact-form-title" style={{ fontSize: "1.9rem" }}>Choose your plan</h2>
        <p style={{ color: "var(--gray)", marginTop: "0.5rem" }}>
          Upgrade to Pro for unlimited practice, notes, and AI.
        </p>

        {error ? (
          <div className="form-message error" style={{ display: "block", margin: "1rem auto", maxWidth: "500px" }}>
            {error}
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1.5rem",
            marginTop: "2rem",
            textAlign: "left",
          }}
        >
          {/* Free */}
          <PlanCard
            name="Free"
            price="$0"
            cadence="forever"
            features={FREE_FEATURES}
            highlighted={!isPro}
            action={
              <button className="btn btn-secondary" style={{ width: "100%" }} disabled>
                {isPro ? "Included" : "Current plan"}
              </button>
            }
          />

          {/* Pro */}
          <PlanCard
            name="Pro"
            price="$20"
            cadence="per month"
            features={PRO_FEATURES}
            highlighted={isPro}
            action={
              isPro ? (
                <button className="btn btn-secondary" style={{ width: "100%" }} disabled>
                  Current plan
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  style={{ width: "100%" }}
                  disabled={busy}
                  onClick={handleUpgrade}
                >
                  {busy ? "Redirecting…" : "Upgrade to Pro"}
                </button>
              )
            }
          />
        </div>
      </div>
    </section>
  );
}

function PlanCard({
  name,
  price,
  cadence,
  features,
  highlighted,
  action,
}: {
  name: string;
  price: string;
  cadence: string;
  features: string[];
  highlighted: boolean;
  action: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "1.75rem",
        borderRadius: "16px",
        background: "rgba(255,255,255,0.04)",
        border: highlighted ? "1px solid var(--primary, #7c5cff)" : "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <div>
        <h3 style={{ color: "var(--light)", margin: 0, fontSize: "1.25rem" }}>{name}</h3>
        <div style={{ marginTop: "0.5rem" }}>
          <span style={{ color: "var(--light)", fontSize: "2rem", fontWeight: 700 }}>{price}</span>
          <span style={{ color: "var(--gray)", marginLeft: "0.4rem" }}>{cadence}</span>
        </div>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.6rem", flex: 1 }}>
        {features.map((f) => (
          <li key={f} style={{ color: "var(--gray)", fontSize: "0.9rem", display: "flex", gap: "0.5rem" }}>
            <span style={{ color: "var(--primary, #7c5cff)" }}>✓</span> {f}
          </li>
        ))}
      </ul>
      {action}
    </div>
  );
}
