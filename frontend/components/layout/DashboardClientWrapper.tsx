"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PageContextProvider } from "@/frontend/contexts/page-context";
import { GlobalAssistant } from "./GlobalAssistant";
import { AnimatedPage } from "./AnimatedPage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/frontend/components/ui/dialog";
import { CanvasConnectionAgreement } from "@/frontend/components/onboarding/CanvasConnectionAgreement";

// Bump this key when sync reconciliation behavior changes so existing sessions
// perform one fresh sync instead of waiting on an older client-side timestamp.
const AUTOSYNC_KEY = "smartlearn_autosync_ts_v4";
const AUTOSYNC_INTERVAL_MS = 60 * 1000;

/**
 * Client shell that:
 * 1. Provides PageContextProvider so any page can push its visible content
 * 2. Renders GlobalAssistant inside that provider so it can read the content
 * 3. Runs a lightweight LMS sync at most once per minute across open tabs,
 *    then refreshes server components so lifecycle changes appear automatically.
 */
type PendingCanvasAgreement = {
  canvas_domain: string | null;
  id: string;
};

export function DashboardClientWrapper({
  children,
  pendingCanvasAgreement,
}: {
  children: ReactNode;
  pendingCanvasAgreement?: PendingCanvasAgreement | null;
}) {
  const router = useRouter();
  const [resolvedAgreementId, setResolvedAgreementId] = useState<string | null>(null);
  const showAgreementGate = Boolean(
    pendingCanvasAgreement && pendingCanvasAgreement.id !== resolvedAgreementId
  );

  async function finishPendingAgreement(connectionId: string) {
    try {
      await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, mode: "quick" }),
      });
    } finally {
      setResolvedAgreementId(connectionId);
      router.refresh();
    }
  }

  useEffect(() => {
    let requestInFlight = false;

    async function syncIfDue() {
      if (requestInFlight || document.visibilityState === "hidden") return;
      const lastSync = localStorage.getItem(AUTOSYNC_KEY);
      const parsedLastSync = lastSync ? Number.parseInt(lastSync, 10) : 0;
      const elapsed = Number.isFinite(parsedLastSync) ? Date.now() - parsedLastSync : Infinity;
      if (elapsed < AUTOSYNC_INTERVAL_MS) return;

      requestInFlight = true;
      // Mark before requesting so multiple open tabs do not start the same sync.
      localStorage.setItem(AUTOSYNC_KEY, String(Date.now()));
      try {
        const response = await fetch("/api/sync/all?mode=quick", { method: "POST" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.success === false) throw new Error(payload?.error ?? "Auto-sync failed");
        window.dispatchEvent(new Event("smartlearn:sync-complete"));
        router.refresh();
      } catch {
        localStorage.removeItem(AUTOSYNC_KEY);
      } finally {
        requestInFlight = false;
      }
    }

    void syncIfDue();
    const intervalId = window.setInterval(() => void syncIfDue(), AUTOSYNC_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void syncIfDue();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageContextProvider>
      <AnimatedPage>{children}</AnimatedPage>
      <GlobalAssistant />
      <Dialog open={showAgreementGate} onOpenChange={() => undefined}>
        <DialogContent
          className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-4xl overflow-y-auto rounded-2xl border-sky-300/15 bg-[rgba(7,12,24,0.97)] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.7)] sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:p-7 [&>button]:hidden"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Canvas connection agreement</DialogTitle>
            <DialogDescription>You must agree before using the connected Canvas account in Smartlearn.</DialogDescription>
          </DialogHeader>
          {pendingCanvasAgreement ? (
            <CanvasConnectionAgreement
              canvasDomain={pendingCanvasAgreement.canvas_domain}
              connectionId={pendingCanvasAgreement.id}
              onAccepted={finishPendingAgreement}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </PageContextProvider>
  );
}
