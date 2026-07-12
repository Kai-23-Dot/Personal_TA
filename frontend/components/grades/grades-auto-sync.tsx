"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RefreshCw } from "lucide-react";

/**
 * Fires a grades-only Canvas sync every time the Grades tab is opened.
 *
 * The page itself renders instantly from already-synced data (server
 * component); this refreshes it in the background — stale-while-revalidate —
 * and calls router.refresh() so new grades appear without a manual reload.
 */
export function GradesAutoSync() {
  const router = useRouter();
  const firedRef = useRef(false);
  const [state, setState] = useState<"syncing" | "done" | "idle">("syncing");

  useEffect(() => {
    // Strict-mode double-mount guard — one sync per page open.
    if (firedRef.current) return;
    firedRef.current = true;

    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/sync/grades", { method: "POST" });
        const data = await res.json().catch(() => null);
        if (!mounted) return;
        if (res.ok && data?.success) {
          setState("done");
          // Re-render the server component with the fresh grade rows.
          router.refresh();
          setTimeout(() => mounted && setState("idle"), 2500);
        } else {
          setState("idle");
        }
      } catch {
        if (mounted) setState("idle");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  if (state === "idle") return null;

  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400"
    >
      {state === "syncing" ? (
        <>
          <RefreshCw className="h-3 w-3 animate-spin text-sky-300" />
          Syncing latest grades…
        </>
      ) : (
        <>
          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
          Grades up to date
        </>
      )}
    </span>
  );
}
