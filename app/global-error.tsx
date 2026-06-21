"use client";

import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/frontend/components/ui/empty-state";
import "./globals.css";
import "./chain-summit.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <section className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
          <EmptyState
            icon={AlertTriangle}
            title="Something went wrong"
            description={error?.message || "Unexpected error. Please try again."}
            action={<button className="btn btn-primary" type="button" onClick={reset}>Try again</button>}
          />
        </section>
      </body>
    </html>
  );
}
