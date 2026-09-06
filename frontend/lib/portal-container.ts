"use client";

import { useEffect, useState } from "react";

/**
 * Where portalled overlays (Select menus, Dialogs) should mount.
 *
 * Radix portals default to document.body. That puts the overlay *outside*
 * [data-dashboard-shell], which is where the workspace redefines its design
 * tokens — so a dropdown opened in the light workspace inherited the dark
 * :root tokens the public site still uses and rendered as dark navy on navy.
 *
 * Mounting inside the shell instead means an overlay always inherits the theme
 * of the surface that opened it: light in the workspace, dark on the public
 * pages (where there is no shell and this falls back to body).
 *
 * Returns undefined on the first client render and during SSR, which is the
 * value Radix treats as "use the default" — so the overlay still mounts if the
 * shell is missing.
 */
export function usePortalContainer(): HTMLElement | undefined {
  const [container, setContainer] = useState<HTMLElement | undefined>(undefined);

  useEffect(() => {
    // Read on mount rather than at module scope: the shell is rendered by the
    // dashboard layout, so it does not exist until after hydration.
    const shell = document.querySelector<HTMLElement>("[data-dashboard-shell]");
    setContainer(shell ?? undefined);
  }, []);

  return container;
}
