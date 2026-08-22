"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Waypoints,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";

type CanvasConnectionAgreementProps = {
  canvasDomain?: string | null;
  connectionId: string;
  onAccepted: (connectionId: string) => Promise<void> | void;
};

const commitments = [
  {
    icon: Waypoints,
    title: "Independent from Canvas",
    body: "Smartlearn is an independent study tool. It is not affiliated with, sponsored by, or endorsed by Instructure or Canvas.",
  },
  {
    icon: ShieldCheck,
    title: "Safe, authorized use",
    body: "This connection is only for organizing learning data you are allowed to access. Do not use it to harm, disrupt, impersonate, bypass controls, or access another person’s account.",
  },
  {
    icon: BookOpenCheck,
    title: "Your school’s rules still apply",
    body: "Follow your school’s academic-integrity, privacy, and technology policies. Review synced data and AI guidance, and keep your Canvas token private.",
  },
] as const;

export function CanvasConnectionAgreement({
  canvasDomain,
  connectionId,
  onAccepted,
}: CanvasConnectionAgreementProps) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acceptAgreement() {
    if (!agreed || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/lms/canvas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true, connectionId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success === false) {
        if (response.status === 401) {
          throw new Error("Your Smartlearn session expired. Sign in again to finish connecting Canvas.");
        }
        throw new Error(payload?.error ?? "Smartlearn could not save your agreement.");
      }
      await onAccepted(connectionId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Smartlearn could not save your agreement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="min-w-0" aria-labelledby="canvas-agreement-title" data-testid="canvas-connection-agreement">
      <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/[0.07] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-sky-200">
        <ShieldCheck className="h-3.5 w-3.5" /> Required before syncing
      </div>
      <h2 id="canvas-agreement-title" className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        One quick agreement before Canvas goes live.
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Your token was verified{canvasDomain ? <> for <strong className="break-all text-foreground">{canvasDomain}</strong></> : null}, but Smartlearn will not activate or sync this connection until you agree below.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {commitments.map(({ icon: Icon, title, body }) => (
          <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-300/15 bg-sky-400/[0.08] text-sky-200">
              <Icon className="h-4 w-4" />
            </span>
            <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{body}</p>
          </article>
        ))}
      </div>

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/10 p-4 transition hover:border-sky-300/25">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded accent-sky-400"
          checked={agreed}
          disabled={busy}
          onChange={(event) => { setAgreed(event.target.checked); setError(null); }}
        />
        <span className="text-xs leading-5 text-slate-300 sm:text-sm sm:leading-6">
          I am authorized to connect this Canvas account. I agree to the <Link href="/terms" target="_blank" className="font-semibold text-sky-300 underline decoration-sky-300/30 underline-offset-2">Smartlearn Terms</Link> and <Link href="/privacy" target="_blank" className="font-semibold text-sky-300 underline decoration-sky-300/30 underline-offset-2">Privacy Policy</Link>, and I will follow my school’s rules and the guidelines above.
        </span>
      </label>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <a
          href="https://www.instructure.com/policies/canvas-api-policy"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline decoration-white/15 underline-offset-4 hover:text-foreground"
        >
          Read the Canvas API Policy <ExternalLink className="h-3 w-3" />
        </a>
        <Button className="h-11 w-full sm:w-auto" disabled={!agreed || busy} onClick={acceptAgreement}>
          {busy ? <><Loader2 className="animate-spin" /> Saving agreement…</> : <>Agree &amp; activate Canvas <ArrowRight /></>}
        </Button>
      </div>

      {error ? <div role="alert" className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div> : null}
      <p className="mt-4 text-center text-[11px] leading-5 text-muted-foreground">
        You can revoke the token in Canvas or disconnect Smartlearn from Settings at any time.
      </p>
    </section>
  );
}
