"use client";

import { useState } from "react";
import { CheckCircle2, Flame, Loader2 } from "lucide-react";
import { cn } from "@/backend/utils";

/**
 * One-tap "I studied today" button. Idempotent server-side, so optimistic
 * flipping is safe; the response's health/streak are lifted to the parent so
 * signals update without a refetch.
 */
export function CheckinButton({
  groupId,
  checkedIn,
  size = "default",
  onCheckedIn,
}: {
  groupId: string;
  checkedIn: boolean;
  size?: "default" | "sm";
  onCheckedIn: (result: { health: unknown; streak: number; userId: string; checkinsToday: string[] }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(checkedIn);

  const isDone = done || checkedIn;

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (isDone || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/checkins`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setDone(true);
        onCheckedIn({
          health: data.health,
          streak: data.streak,
          userId: data.userId,
          checkinsToday: data.checkinsToday ?? [],
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDone || busy}
      aria-label={isDone ? "Checked in today" : "Check in for today"}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl border font-medium transition-all duration-200 ease-smooth-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none",
        size === "sm" ? "px-2.5 py-1 text-xs" : "w-full px-4 py-2.5 text-sm",
        isDone
          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
          : "border-sky-400/30 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 active:scale-[0.98]"
      )}
    >
      {busy ? (
        <Loader2 className={cn("animate-spin", size === "sm" ? "h-3 w-3" : "h-4 w-4")} />
      ) : isDone ? (
        <CheckCircle2 className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} />
      ) : (
        <Flame className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} />
      )}
      {isDone ? "Checked in today" : "Check in"}
    </button>
  );
}
