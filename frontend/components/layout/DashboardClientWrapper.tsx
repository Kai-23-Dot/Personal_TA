"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PageContextProvider } from "@/frontend/contexts/page-context";
import { GlobalAssistant } from "./GlobalAssistant";

const AUTOSYNC_KEY = "conlearn_autosync_ts";
const AUTOSYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Client shell that:
 * 1. Provides PageContextProvider so any page can push its visible content
 * 2. Renders GlobalAssistant inside that provider so it can read the content
 * 3. Auto-syncs LMS connections on first visit within a 15-minute window,
 *    then refreshes server components so the UI shows the latest data.
 */
export function DashboardClientWrapper({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const lastSync = localStorage.getItem(AUTOSYNC_KEY);
    const elapsed = lastSync ? Date.now() - parseInt(lastSync, 10) : Infinity;
    if (elapsed < AUTOSYNC_INTERVAL_MS) return;

    // Mark time before the request so overlapping tabs don't double-sync
    localStorage.setItem(AUTOSYNC_KEY, String(Date.now()));

    fetch("/api/sync/all", { method: "POST" })
      .then((res) => {
        if (res.ok) {
          // Refresh server components so courses/assignments reflect the latest sync
          router.refresh();
        } else {
          // Clear timestamp so the next visit retries
          localStorage.removeItem(AUTOSYNC_KEY);
        }
      })
      .catch(() => {
        localStorage.removeItem(AUTOSYNC_KEY);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageContextProvider>
      {children}
      <GlobalAssistant />
    </PageContextProvider>
  );
}
