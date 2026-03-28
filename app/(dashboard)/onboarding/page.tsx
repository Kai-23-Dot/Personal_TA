"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

  return (
    <section className="section">
      <h2 className="animate-on-scroll">Welcome to PersonalTA</h2>
      <p style={{ color: "var(--gray)" }}>Complete these steps to personalize your assistant.</p>

      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "800px", margin: "0 auto" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Getting Started</h3>
          <ul style={{ color: "var(--light)" }}>
            <li>
              <input
                type="checkbox"
                checked={Boolean(steps.connectLms)}
                onChange={(e) => updateStep("connectLms", e.target.checked)}
              />{" "}
              Connect your LMS in <Link href="/settings">Settings</Link>
            </li>
            <li>
              <input
                type="checkbox"
                checked={Boolean(steps.uploadNotes)}
                onChange={(e) => updateStep("uploadNotes", e.target.checked)}
              />{" "}
              Upload or import notes in <Link href="/notes">Notes</Link>
            </li>
            <li>
              <input
                type="checkbox"
                checked={Boolean(steps.generatePlan)}
                onChange={(e) => updateStep("generatePlan", e.target.checked)}
              />{" "}
              Generate your first plan in <Link href="/planner">Planner</Link>
            </li>
            <li>
              <input
                type="checkbox"
                checked={Boolean(steps.tryPractice)}
                onChange={(e) => updateStep("tryPractice", e.target.checked)}
              />{" "}
              Try a practice session in <Link href="/practice">Practice</Link>
            </li>
          </ul>
          <button className="contact-submit-btn" onClick={finishOnboarding}>
            Finish Onboarding
          </button>
          {completed ? <p style={{ color: "var(--gray)" }}>Onboarding complete.</p> : null}
        </div>
      </div>
    </section>
  );
}
