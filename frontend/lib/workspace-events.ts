"use client";

import { useEffect, useRef } from "react";

/**
 * Telling the workspace that something finished.
 *
 * Several surfaces are derived from work the student does elsewhere: study
 * priorities are ranked from practice accuracy, weak topics and exam readiness
 * come from the same attempts, the focus figures come from logged sessions.
 * Until now the only thing that invalidated any of it was an LMS sync, so
 * finishing a practice test left the dashboard still recommending the topic you
 * had just practised, until a reload.
 *
 * Completion points call `notifyWorkspaceChanged(...)`; derived surfaces call
 * `useWorkspaceRefresh(...)` with the kinds they actually depend on and refetch.
 *
 * Kinds are deliberately coarse. A finer-grained map of which panel depends on
 * which table would go stale the first time someone adds a panel, and the cost
 * of an occasional extra refetch is far lower than the cost of showing a
 * student stale advice.
 */
export const WORKSPACE_CHANGED_EVENT = "smartlearn:workspace-changed";

/** Kept so the existing sync listeners keep working unchanged. */
export const SYNC_COMPLETE_EVENT = "smartlearn:sync-complete";

export type WorkspaceChange =
  | "practice"     // a practice test was submitted
  | "flashcards"   // a card was graded in a review session
  | "focus"        // a focus session was logged
  | "notes"        // a study guide or note was created or removed
  | "assignments"  // an assignment's state changed
  | "sync";        // the LMS sync brought new data

export function notifyWorkspaceChanged(kind: WorkspaceChange) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WorkspaceChange>(WORKSPACE_CHANGED_EVENT, { detail: kind })
  );
}

/**
 * Refetch when one of `kinds` completes.
 *
 * `onChange` is read through a ref, so a caller can pass an inline closure
 * without the subscription tearing down and rebuilding on every render.
 */
export function useWorkspaceRefresh(
  kinds: readonly WorkspaceChange[],
  onChange: (kind: WorkspaceChange) => void
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const watched = kinds.join(",");

  useEffect(() => {
    const wanted = new Set(watched.split(",") as WorkspaceChange[]);

    function handle(event: Event) {
      const kind = (event as CustomEvent<WorkspaceChange>).detail;
      if (kind && wanted.has(kind)) onChangeRef.current(kind);
    }

    // The LMS sync predates this and dispatches a plain Event; treat it as the
    // "sync" kind so both paths land in one handler.
    function handleLegacySync() {
      if (wanted.has("sync")) onChangeRef.current("sync");
    }

    window.addEventListener(WORKSPACE_CHANGED_EVENT, handle);
    window.addEventListener(SYNC_COMPLETE_EVENT, handleLegacySync);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, handle);
      window.removeEventListener(SYNC_COMPLETE_EVENT, handleLegacySync);
    };
  }, [watched]);
}
