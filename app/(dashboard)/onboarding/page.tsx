"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/frontend/components/ui/card";
import { Button } from "@/frontend/components/ui/button";

export default function OnboardingPage() {
  const [steps, setSteps] = useState<Record<string, boolean>>({});
  const [completed, setCompleted] = useState(false);

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
    { key: "connectLms", label: "Connect your LMS in", href: "/settings", linkLabel: "Settings" },
    { key: "uploadNotes", label: "Upload or import notes in", href: "/notes", linkLabel: "Notes" },
    { key: "generatePlan", label: "Generate your first plan in", href: "/planner", linkLabel: "Planner" },
    { key: "tryPractice", label: "Try a practice session in", href: "/practice", linkLabel: "Practice" },
  ];

  return (
    <div className="mx-auto max-w-2xl pb-16 pt-6">
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
          <Button onClick={finishOnboarding}>Finish onboarding</Button>
          {completed ? <p className="text-sm text-muted-foreground">Onboarding complete.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
