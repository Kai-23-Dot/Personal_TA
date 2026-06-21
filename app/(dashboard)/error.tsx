"use client";

import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/frontend/components/ui/empty-state";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="section">
      <EmptyState
        icon={AlertTriangle}
        title="We hit a snag"
        description={error?.message || "Something went wrong while loading this page."}
        action={<button className="btn btn-primary" type="button" onClick={reset}>Retry</button>}
      />
    </section>
  );
}
