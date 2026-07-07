"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/backend/utils";
import {
  LayoutDashboard,
  ClipboardList,
  Dumbbell,
  Layers,
  Grid2x2,
  X,
  MessageCircle,
  Sparkles,
  Settings,
} from "lucide-react";
import { workspaceNavItems } from "@/frontend/lib/nav-items";

const quickAccess = [
  { href: "/dashboard",   label: "Home",        icon: LayoutDashboard },
  { href: "/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/practice",    label: "Practice",    icon: Dumbbell },
  { href: "/flashcards",  label: "Flashcards",  icon: Layers },
];

interface MobileNavProps {
  plan?: "free" | "pro";
}

export function MobileNav({ plan = "free" }: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer automatically whenever navigation happens.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      <div
        role="navigation"
        aria-label="Mobile navigation"
        className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 gap-1 rounded-2xl border border-white/10 bg-[rgba(9,12,24,0.92)] p-2 shadow-2xl backdrop-blur-xl md:hidden"
      >
        {quickAccess.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-center text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-white/5 hover:text-foreground",
                active && "bg-sky-500/12 text-sky-200"
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open full navigation menu"
          aria-expanded={open}
          className="flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-center text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-white/5 hover:text-foreground"
        >
          <Grid2x2 className="h-4 w-4" />
          More
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[75vh] animate-slide-up overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[rgba(9,12,24,0.97)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Navigate</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-white/5 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {workspaceNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2 py-3 text-center text-xs font-medium text-muted-foreground transition-colors duration-150 hover:border-white/15 hover:bg-white/6 hover:text-foreground",
                      active && "border-sky-400/30 bg-sky-500/12 text-sky-200"
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {item.label}
                  </Link>
                );
              })}
              <Link
                href="/chat"
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2 py-3 text-center text-xs font-medium text-muted-foreground transition-colors duration-150 hover:border-white/15 hover:bg-white/6 hover:text-foreground",
                  isActive("/chat") && "border-sky-400/30 bg-sky-500/12 text-sky-200"
                )}
              >
                <MessageCircle className="h-[18px] w-[18px]" />
                Chat
              </Link>
            </div>

            <div className="mt-3 border-t border-white/8 pt-3">
              <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-sky-300/60">Account</p>
              <div className="space-y-1">
                {plan !== "pro" && (
                  <Link
                    href="/pricing"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-white/5 hover:text-foreground",
                      isActive("/pricing") && "bg-sky-500/12 text-sky-200"
                    )}
                  >
                    <Sparkles className="h-[15px] w-[15px]" />
                    Upgrade
                  </Link>
                )}
                <Link
                  href="/settings"
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-white/5 hover:text-foreground",
                    isActive("/settings") && "bg-sky-500/12 text-sky-200"
                  )}
                >
                  <Settings className="h-[15px] w-[15px]" />
                  Settings
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
