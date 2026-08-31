"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { CreditCard, Settings, ShieldCheck, X } from "lucide-react";
import { cn } from "@/backend/utils";
import { PLAN_CATALOG, type Plan } from "@/backend/billing/plans";
import { workspaceNavGroups } from "@/frontend/lib/nav-items";

interface MobileNavProps {
  plan?: Plan;
  isAdmin?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileNav({ plan = "free", isAdmin = false, open, onOpenChange }: MobileNavProps) {
  const pathname = usePathname();
  const isPaid = plan !== "free";

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out data-[state=open]:fade-in motion-reduce:animate-none md:hidden" />
        <Dialog.Content
          className="workspace-mobile-nav fixed inset-y-0 left-0 z-50 flex w-[min(88vw,20rem)] flex-col border-r border-border bg-sidebar text-sidebar-foreground shadow-lg outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left motion-reduce:animate-none md:hidden"
          aria-describedby="mobile-navigation-description"
        >
          <div className="flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border px-4">
            <Image src="/smartlearn-logo.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
            <Dialog.Title className="text-sm font-semibold tracking-wide">Smartlearn</Dialog.Title>
            <Dialog.Description id="mobile-navigation-description" className="sr-only">
              Navigate the Smartlearn workspace.
            </Dialog.Description>
            <Dialog.Close asChild>
              <button
                type="button"
                className="ml-auto grid h-11 w-11 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close menu"
              >
                <X className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            <p className="sr-only">Navigate</p>
            <nav aria-label="Mobile navigation" className="space-y-5">
              {workspaceNavGroups.map((group) => (
                <div key={group.label}>
                  <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-11 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active && "bg-sidebar-accent text-sidebar-accent-foreground"
                          )}
                        >
                          <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className="mt-5 border-t border-sidebar-border pt-4">
              <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                Account
              </p>
              <div className="space-y-0.5">
                <Link
                  href="/pricing"
                  aria-current={isActive("/pricing") ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive("/pricing") && "bg-sidebar-accent text-sidebar-accent-foreground"
                  )}
                >
                  <CreditCard className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{isPaid ? "Manage plan" : "View plans"}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">{PLAN_CATALOG[plan].name}</span>
                </Link>
                <Link
                  href="/settings"
                  aria-current={isActive("/settings") ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive("/settings") && "bg-sidebar-accent text-sidebar-accent-foreground"
                  )}
                >
                  <Settings className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  Settings
                </Link>
                {isAdmin ? (
                  <Link
                    href="/admin"
                    aria-current={isActive("/admin") ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive("/admin") && "bg-sidebar-accent text-sidebar-accent-foreground"
                    )}
                  >
                    <ShieldCheck className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    Owner analytics
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
