"use client";

import { usePathname } from "next/navigation";

/**
 * Wraps page content with a fade-in animation on every navigation.
 * Uses `key={pathname}` so the div remounts on route change, re-triggering the animation.
 */
export function AnimatedPage({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-fade-in">
      {children}
    </div>
  );
}
