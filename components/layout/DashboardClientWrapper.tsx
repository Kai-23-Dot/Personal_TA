"use client";

import type { ReactNode } from "react";
import { PageContextProvider } from "@/lib/contexts/page-context";
import { GlobalAssistant } from "./GlobalAssistant";

/**
 * Client shell that:
 * 1. Provides PageContextProvider so any page can push its visible content
 * 2. Renders GlobalAssistant inside that provider so it can read the content
 *
 * Server components can safely be passed as `children` — they render as RSC.
 */
export function DashboardClientWrapper({ children }: { children: ReactNode }) {
  return (
    <PageContextProvider>
      {children}
      <GlobalAssistant />
    </PageContextProvider>
  );
}
