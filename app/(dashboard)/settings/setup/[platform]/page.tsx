"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { CanvasConnectionWizard } from "@/frontend/components/onboarding/CanvasConnectionWizard";

export default function SetupPlatformPage() {
  const params = useParams<{ platform: string }>();
  const platform = params?.platform ?? "";
  const platformLabel = useMemo(
    () => platform.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
    [platform]
  );

  const isCanvas = platform === "canvas";

  return (
    <section className="mx-auto w-full max-w-3xl pb-16 pt-2 sm:pt-6">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/85 p-4 shadow-lg sm:p-6 lg:p-8">
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">Connect {platformLabel}</h1>
          <p className="mb-5 mt-1 text-sm text-muted-foreground sm:mb-6">Bring your classes into Smartlearn.</p>

          {!isCanvas ? (
            <p className="text-sm text-muted-foreground">
              Setup for {platformLabel} is currently handled via the Settings page.
            </p>
          ) : (
            <CanvasConnectionWizard />
          )}
      </div>
    </section>
  );
}
