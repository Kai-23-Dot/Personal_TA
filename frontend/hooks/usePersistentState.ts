"use client";

import { useEffect, useState } from "react";

/**
 * Drop-in replacement for `useState` that transparently persists the value to
 * localStorage, so in-progress work (draft forms, selections, etc.) survives a
 * page navigation, refresh, or accidental exit — and is restored on return.
 *
 * SSR-safe: it renders `initial` on the server and during the first client
 * paint, then hydrates from storage in an effect to avoid hydration mismatches.
 *
 * @param key      Stable, namespaced storage key, e.g. "conlearn:notes:draft".
 * @param initial  Default value used before hydration / when nothing is stored.
 * @returns        `[value, setValue, hydrated]` — `hydrated` is true once the
 *                 stored value (if any) has been loaded.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  // Load once on mount (client only).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setState(JSON.parse(raw) as T);
    } catch {
      // Corrupt/unavailable storage — fall back to `initial`.
    }
    setHydrated(true);
    // Re-run only if the key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Persist after hydration so we never clobber stored data with `initial`.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Quota/private-mode errors are non-fatal.
    }
  }, [key, state, hydrated]);

  return [state, setState, hydrated] as const;
}

/** Remove a persisted draft (e.g. after the work is completed/submitted). */
export function clearPersistentState(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
