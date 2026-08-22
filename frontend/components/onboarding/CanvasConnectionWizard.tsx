"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { canvasSettingsUrl, normalizeCanvasHostInput } from "@/backend/lms/canvasSetup";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { Progress } from "@/frontend/components/ui/progress";
import { CanvasConnectionAgreement } from "./CanvasConnectionAgreement";

const STEP_LABELS = ["Canvas address", "Open settings", "Create token", "Connect", "Agreement"];

type CanvasConnectionWizardProps = {
  onAgreementRequiredChange?: (required: boolean) => void;
  onConnected?: () => void;
};

async function markCanvasStepComplete() {
  try {
    const currentResponse = await fetch("/api/onboarding", { cache: "no-store" });
    const current = currentResponse.ok ? await currentResponse.json() : null;
    await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        completed: Boolean(current?.completed),
        steps: { ...(current?.steps ?? {}), connectLms: true },
      }),
    });
  } catch {
    // The Canvas connection is authoritative. A checklist update should never
    // turn a successful connection into a failure for the student.
  }
}

export function CanvasConnectionWizard({
  onAgreementRequiredChange,
  onConnected,
}: CanvasConnectionWizardProps) {
  const [step, setStep] = useState(0);
  const [domain, setDomain] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [pendingConnectionId, setPendingConnectionId] = useState<string | null>(null);

  const normalizedDomain = useMemo(() => {
    try {
      return normalizeCanvasHostInput(domain);
    } catch {
      return null;
    }
  }, [domain]);

  const settingsUrl = useMemo(() => {
    try {
      return canvasSettingsUrl(domain);
    } catch {
      return null;
    }
  }, [domain]);

  function continueFromDomain() {
    try {
      const host = normalizeCanvasHostInput(domain);
      setDomain(host);
      setError(null);
      setStep(1);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Enter a valid Canvas address.");
    }
  }

  async function finishCanvasConnection(connectionId: string) {
    onAgreementRequiredChange?.(false);
    await markCanvasStepComplete();

    try {
      const syncResponse = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, mode: "quick" }),
      });
      const syncPayload = await syncResponse.json().catch(() => null);
      if (!syncResponse.ok || syncPayload?.success === false) {
        setSyncWarning(
          "Canvas is linked, but the first course sync did not fully finish. You can retry from Settings without reconnecting."
        );
      }
    } catch {
      setSyncWarning(
        "Canvas is linked, but the first course sync could not start. You can retry from Settings without reconnecting."
      );
    }

    setStep(STEP_LABELS.length);
    onConnected?.();
  }

  async function connectCanvas(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    let host: string;
    try {
      host = normalizeCanvasHostInput(domain);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Enter a valid Canvas address.");
      setStep(0);
      return;
    }
    if (!token.trim()) {
      setError("Paste the token Canvas showed you.");
      return;
    }

    setBusy(true);
    setError(null);
    setSyncWarning(null);
    try {
      const response = await fetch("/api/lms/canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: host, access_token: token.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success === false) {
        if (response.status === 401) {
          throw new Error("Your Smartlearn session expired. Sign in again, then reopen Canvas setup.");
        }
        throw new Error(payload?.error ?? "Canvas could not be connected. Check the address and token.");
      }

      // Remove the password-equivalent secret from component state immediately.
      setToken("");
      if (!payload?.connectionId) {
        throw new Error("Canvas verified the token, but Smartlearn could not save the connection.");
      }

      if (payload.agreementRequired !== false) {
        setPendingConnectionId(payload.connectionId);
        onAgreementRequiredChange?.(true);
        setStep(4);
      } else {
        await finishCanvasConnection(payload.connectionId);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Canvas could not be connected.");
    } finally {
      setBusy(false);
    }
  }

  if (step === STEP_LABELS.length) {
    return (
      <div className="min-w-0 py-4 text-center sm:py-6" data-testid="canvas-connection-success">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
          <CheckCircle2 className="h-7 w-7" />
        </span>
        <h2 className="mt-5 text-xl font-semibold text-foreground sm:text-2xl">Canvas is connected</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Smartlearn can now organize your Canvas courses, assignments, pages, modules, and files.
        </p>
        {syncWarning ? (
          <div role="status" className="mx-auto mt-4 max-w-lg rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-left text-sm text-amber-100">
            {syncWarning}
          </div>
        ) : (
          <p role="status" className="mt-4 text-sm text-emerald-300">Your first Canvas sync finished successfully.</p>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
          <Button asChild className="h-11 w-full sm:w-auto"><Link href="/dashboard">Go to dashboard</Link></Button>
          <Button variant="secondary" asChild className="h-11 w-full sm:w-auto"><Link href="/settings">View connection</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5" data-testid="canvas-connection-wizard">
      <div>
        <div className="mb-2 flex items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>Step {step + 1} of {STEP_LABELS.length}</span>
          <span>{STEP_LABELS[step]}</span>
        </div>
        <Progress value={((step + 1) / STEP_LABELS.length) * 100} />
      </div>

      {step === 0 ? (
        <div className="space-y-4 sm:space-y-5">
          <div>
            <div className="flex items-center gap-2 text-sky-300"><ShieldCheck className="h-5 w-5" /><span className="text-sm font-semibold">No Canvas password required</span></div>
            <h2 className="mt-3 text-xl font-semibold text-foreground sm:text-2xl">Connect your school Canvas</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Paste your Canvas website or any Canvas course link. Smartlearn uses the school address to find your Canvas account and never asks for your Canvas password.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="canvas-wizard-domain">Canvas website</Label>
            <Input
              id="canvas-wizard-domain"
              autoFocus
              inputMode="url"
              placeholder="school.instructure.com"
              value={domain}
              onChange={(event) => { setDomain(event.target.value); setError(null); }}
              onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); continueFromDomain(); }
              }}
            />
            <p className="text-xs text-muted-foreground">Example: https://myschool.instructure.com</p>
          </div>
          <div className="flex justify-end"><Button className="h-11 w-full sm:w-auto" onClick={continueFromDomain}>Continue <ArrowRight /></Button></div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4 sm:space-y-5">
          <div>
            <h2 className="text-xl font-semibold text-foreground sm:text-2xl">Open your Canvas settings</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Keep this Smartlearn window open. The button below opens <strong className="break-all text-foreground sm:break-normal">{normalizedDomain}</strong> in a new tab.
            </p>
          </div>
          <ol className="space-y-3 text-sm text-muted-foreground">
            <li className="rounded-xl border border-white/8 bg-white/[0.03] p-3 sm:p-4"><strong className="text-foreground">1.</strong> Sign in to Canvas if asked.</li>
            <li className="rounded-xl border border-white/8 bg-white/[0.03] p-3 sm:p-4"><strong className="text-foreground">2.</strong> In the Canvas sidebar, choose <strong className="text-foreground">Account</strong>, then <strong className="text-foreground">Settings</strong>.</li>
          </ol>
          <Button asChild className="h-11 w-full sm:w-auto">
            <a href={settingsUrl ?? "#"} target="_blank" rel="noreferrer">Open Canvas settings <ExternalLink /></a>
          </Button>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button className="h-11 w-full sm:w-auto" variant="ghost" onClick={() => setStep(0)}><ArrowLeft /> Back</Button><Button className="h-11 w-full sm:w-auto" onClick={() => setStep(2)}>I’m in Settings <ArrowRight /></Button></div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4 sm:space-y-5">
          <div>
            <div className="flex items-center gap-2 text-sky-300"><KeyRound className="h-5 w-5" /><span className="text-sm font-semibold">Canvas access token</span></div>
            <h2 className="mt-3 text-xl font-semibold text-foreground sm:text-2xl">Create a token for Smartlearn</h2>
          </div>
          <ol className="space-y-3 text-sm leading-6 text-muted-foreground">
            <li className="rounded-xl border border-white/8 bg-white/[0.03] p-3 sm:p-4"><strong className="text-foreground">1.</strong> Scroll to <strong className="text-foreground">Approved Integrations</strong>.</li>
            <li className="rounded-xl border border-white/8 bg-white/[0.03] p-3 sm:p-4"><strong className="text-foreground">2.</strong> Select <strong className="text-foreground">+ New Access Token</strong>. If it is missing, your school has disabled personal tokens; ask your Canvas administrator or use Canvas OAuth from Settings.</li>
            <li className="rounded-xl border border-white/8 bg-white/[0.03] p-3 sm:p-4"><strong className="text-foreground">3.</strong> Enter <strong className="text-foreground">Smartlearn</strong> for Purpose. An expiration date is optional but recommended.</li>
            <li className="rounded-xl border border-white/8 bg-white/[0.03] p-3 sm:p-4"><strong className="text-foreground">4.</strong> Select <strong className="text-foreground">Generate Token</strong>, then copy it now—Canvas normally shows the full token only once.</li>
          </ol>
          <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
            Treat this token like a password. Personal tokens are intended for authorized testing; Canvas recommends OAuth for multi-user apps. If your school does not allow tokens, use Canvas OAuth from <Link href="/settings" className="font-semibold underline underline-offset-2">Settings</Link> or contact your Canvas administrator.
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button className="h-11 w-full sm:w-auto" variant="ghost" onClick={() => setStep(1)}><ArrowLeft /> Back</Button><Button className="h-11 w-full sm:w-auto" onClick={() => setStep(3)}>I copied the token <ArrowRight /></Button></div>
        </div>
      ) : null}

      {step === 3 ? (
        <form className="space-y-4 sm:space-y-5" onSubmit={connectCanvas}>
          <div>
            <h2 className="text-xl font-semibold text-foreground sm:text-2xl">Paste the token and connect</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">The token lets Smartlearn sync <strong className="break-all text-foreground sm:break-normal">{normalizedDomain}</strong>. Smartlearn will not show the saved token again. Revoke it in Canvas immediately if you think it was exposed.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="canvas-wizard-token">Canvas API token</Label>
            <div className="relative">
              <Input
                id="canvas-wizard-token"
                type={showToken ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste your token"
                className="pr-11"
                value={token}
                onChange={(event) => { setToken(event.target.value); setError(null); }}
              />
              <button type="button" aria-label={showToken ? "Hide Canvas token" : "Show Canvas token"} className="absolute right-1 top-1 flex h-7 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground" onClick={() => setShowToken((visible) => !visible)}>
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button className="h-11 w-full sm:w-auto" type="button" variant="ghost" disabled={busy} onClick={() => setStep(2)}><ArrowLeft /> Back</Button><Button className="h-11 w-full sm:w-auto" type="submit" disabled={busy || !token.trim()}>{busy ? <><Loader2 className="animate-spin" /> Verifying token…</> : <>Continue securely <ArrowRight /></>}</Button></div>
        </form>
      ) : null}

      {step === 4 && pendingConnectionId ? (
        <CanvasConnectionAgreement
          canvasDomain={normalizedDomain}
          connectionId={pendingConnectionId}
          onAccepted={finishCanvasConnection}
        />
      ) : null}

      {error ? <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div> : null}
    </div>
  );
}
