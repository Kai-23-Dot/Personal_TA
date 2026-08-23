"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/frontend/components/ui/card";
import { Button } from "@/frontend/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/frontend/components/ui/dialog";
import { CanvasConnectionWizard } from "@/frontend/components/onboarding/CanvasConnectionWizard";

export default function OnboardingPage() {
  const [steps, setSteps] = useState<Record<string, boolean>>({});
  const [completed, setCompleted] = useState(false);
  const [canvasWizardOpen, setCanvasWizardOpen] = useState(true);
  const [canvasAgreementRequired, setCanvasAgreementRequired] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch("/api/onboarding")
      .then((res) => res.json())
      .then((data) => {
        if (mounted) {
          setSteps(data?.steps ?? {});
          setCompleted(Boolean(data?.completed));
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function updateStep(key: string, value: boolean) {
    const next = { ...steps, [key]: value };
    setSteps(next);
    await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps: next, completed }),
    });
  }

  async function finishOnboarding() {
    await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps, completed: true }),
    });
    setCompleted(true);
  }

  const stepItems = [
    { key: "connectLms", label: "Connect Canvas in", href: "/settings/setup/canvas", linkLabel: "guided setup" },
    { key: "uploadNotes", label: "Upload or import notes in", href: "/notes", linkLabel: "Notes" },
    { key: "tryPractice", label: "Try a practice session in", href: "/practice", linkLabel: "Practice" },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl pb-16 pt-2 sm:pt-6">
      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
          <CardDescription>Complete these steps to personalize your assistant.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ul className="space-y-3">
            {stepItems.map((item) => (
              <li key={item.key} className="flex items-center gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 flex-shrink-0 rounded accent-sky-400"
                  checked={Boolean(steps[item.key])}
                  onChange={(e) => updateStep(item.key, e.target.checked)}
                />
                {item.label}{" "}
                <Link href={item.href} className="text-sky-400 underline-offset-2 hover:underline">
                  {item.linkLabel}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button className="h-11 w-full sm:w-auto" onClick={finishOnboarding}>Finish onboarding</Button>
            <Button className="h-11 w-full sm:w-auto" variant="secondary" onClick={() => setCanvasWizardOpen(true)}>Open Canvas setup guide</Button>
          </div>
          {completed ? <p className="text-sm text-muted-foreground">Onboarding complete.</p> : null}
        </CardContent>
      </Card>

      <Dialog
        open={canvasWizardOpen}
        onOpenChange={(open) => {
          if (!open && canvasAgreementRequired) return;
          setCanvasWizardOpen(open);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto rounded-xl p-4 pt-10 sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:rounded-2xl sm:p-6">
          <DialogHeader className="sr-only">
            <DialogTitle>Connect Canvas</DialogTitle>
            <DialogDescription>Step-by-step Canvas connection setup.</DialogDescription>
          </DialogHeader>
          <CanvasConnectionWizard
            onAgreementRequiredChange={setCanvasAgreementRequired}
            onConnected={() => setSteps((current) => ({ ...current, connectLms: true }))}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
