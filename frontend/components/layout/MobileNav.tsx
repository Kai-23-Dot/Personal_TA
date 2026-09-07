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
  CreditCard,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { workspaceNavItems } from "@/frontend/lib/nav-items";
import { PLAN_CATALOG, type Plan } from "@/backend/billing/plans";

const quickAccess = [
  { href: "/dashboard",   label: "Home",        icon: LayoutDashboard },
  { href: "/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/practice",    label: "Practice",    icon: Dumbbell },
  { href: "/flashcards",  label: "Flashcards",  icon: Layers },
];

interface MobileNavProps {
  plan?: Plan;
  isAdmin?: boolean;
}

export function MobileNav({ plan = "free", isAdmin = false }: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isPaid = plan !== "free";

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
        className="fixed inset-x-2 bottom-2 z-30 grid grid-cols-5 gap-1 rounded-xl border border-border bg-card/95 p-1.5 shadow-none backdrop-blur-xl md:hidden"
      >
        {quickAccess.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md px-2 py-2 text-center text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-[var(--wash-hover)] hover:text-foreground",
                active && "bg-[var(--blue-wash)] text-[var(--blue)]"
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
          className="flex flex-col items-center gap-1 rounded-md px-2 py-2 text-center text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-[var(--wash-hover)] hover:text-foreground"
        >
          <Grid2x2 className="h-4 w-4" />
          More
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 animate-fade-in bg-[rgba(15,15,15,0.32)] backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[75vh] animate-slide-up overflow-y-auto rounded-t-xl border-t border-border bg-card/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-none backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Navigate</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-[var(--wash-hover)] hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Link
              href="/pricing"
              className={cn(
                "mb-3 flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors",
                isPaid
                  ? "border-[var(--success-ink)] bg-[var(--success-bg)]/[0.07] text-[var(--success-ink)]"
                  : "border-[var(--rule)] bg-[var(--blue-wash)] text-[var(--ink)]",
                isActive("/pricing") && "ring-1 ring-[var(--blue-edge)]"
              )}
            >
              <CreditCard className="h-[18px] w-[18px]" />
              <span className="flex-1">{isPaid ? "Manage your plan" : "View plans & upgrade"}</span>
              <span className="rounded-full border border-[var(--rule)] bg-[var(--paper)] px-2 py-0.5 text-[10px] font-bold">
                {PLAN_CATALOG[plan].name}
              </span>
            </Link>

            <div className="grid grid-cols-3 gap-2">
              {workspaceNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border border-[var(--rule)] bg-[var(--paper)] px-2 py-3 text-center text-xs font-medium text-muted-foreground transition-colors duration-150 hover:border-[var(--rule)] hover:bg-[var(--wash-hover)] hover:text-foreground",
                      active && "border-[var(--rule)] bg-[var(--blue-wash)] text-[var(--blue)]"
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
                  "flex flex-col items-center gap-1.5 rounded-xl border border-[var(--rule)] bg-[var(--paper)] px-2 py-3 text-center text-xs font-medium text-muted-foreground transition-colors duration-150 hover:border-[var(--rule)] hover:bg-[var(--wash-hover)] hover:text-foreground",
                  isActive("/chat") && "border-[var(--rule)] bg-[var(--blue-wash)] text-[var(--blue)]"
                )}
              >
                <MessageCircle className="h-[18px] w-[18px]" />
                Chat
              </Link>
            </div>

            <div className="mt-3 border-t border-[var(--rule)] pt-3">
              <p className="mb-2 px-1 text-[10px] font-semibold text-[var(--blue)]">Account</p>
              <div className="space-y-1">
                <Link
                  href="/settings"
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-[var(--wash-hover)] hover:text-foreground",
                    isActive("/settings") && "bg-[var(--blue-wash)] text-[var(--blue)]"
                  )}
                >
                  <Settings className="h-[15px] w-[15px]" />
                  Settings
                </Link>
                {isAdmin ? (
                  <Link
                    href="/admin"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-[var(--wash-hover)] hover:text-foreground",
                      isActive("/admin") && "bg-[var(--blue-wash)] text-[var(--blue)]"
                    )}
                  >
                    <ShieldCheck className="h-[15px] w-[15px]" />
                    Owner analytics
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
