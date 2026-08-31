"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/backend/utils";
import type { Profile } from "@/types";
import type { Plan } from "@/backend/billing/plans";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";

const SIDEBAR_STORAGE_KEY = "smartlearn:workspace:sidebar-collapsed";

type CanvasConnectionSummary = {
  id: string;
  last_synced_at: string | null;
} | null;

export function WorkspaceShell({
  profile,
  plan,
  isAdmin,
  canvasConnection,
  children,
}: {
  profile: Profile | null;
  plan: Plan;
  isAdmin: boolean;
  canvasConnection: CanvasConnectionSummary;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
    } catch {
      setCollapsed(false);
    }
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      try { window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      data-dashboard-shell
      data-notion-workspace-shell
      data-workspace-shell
      data-sidebar-collapsed={collapsed ? "true" : "false"}
    >
      <a href="#workspace-content" className="sr-only z-[100] rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to workspace content
      </a>
      <Sidebar
        profile={profile}
        plan={plan}
        isAdmin={isAdmin}
        collapsed={collapsed}
        onToggle={toggleSidebar}
      />
      <div
        className={cn(
          "workspace-main min-h-screen transition-[padding] duration-200 ease-out motion-reduce:transition-none",
          collapsed ? "md:pl-16" : "md:pl-60"
        )}
      >
        <Header
          isAdmin={isAdmin}
          canvasConnection={canvasConnection}
          onOpenMobileNavigation={() => setMobileOpen(true)}
        />
        <main id="workspace-content" tabIndex={-1} className="w-full px-4 pb-24 pt-6 outline-none sm:px-6 md:pb-10 lg:px-8">
          {children}
        </main>
      </div>
      <MobileNav
        plan={plan}
        isAdmin={isAdmin}
        open={mobileOpen}
        onOpenChange={setMobileOpen}
      />
    </div>
  );
}
