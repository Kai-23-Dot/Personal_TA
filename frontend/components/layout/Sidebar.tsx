"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  CreditCard,
  GraduationCap,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/backend/utils";
import { createClient } from "@/backend/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/frontend/components/ui/avatar";
import { workspaceNavGroups } from "@/frontend/lib/nav-items";
import { PLAN_CATALOG, type Plan } from "@/backend/billing/plans";
import type { Profile } from "@/types";

interface SidebarProps {
  profile: Profile | null;
  plan?: Plan;
  isAdmin?: boolean;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ profile, plan = "free", isAdmin = false, collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const isPaid = plan !== "free";

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
    toast.success("Signed out successfully");
  }

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((name) => name[0]).join("").toUpperCase().slice(0, 2)
    : profile?.email?.[0]?.toUpperCase() ?? "U";

  function active(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside
      aria-label="Smartlearn sidebar"
      className={cn(
        "workspace-sidebar fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex",
        collapsed ? "w-16" : "w-60"
      )}
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className={cn("flex h-14 items-center border-b border-sidebar-border", collapsed ? "justify-center px-2" : "gap-2 px-3")}>
        {collapsed ? (
          <button
            type="button"
            onClick={onToggle}
            className="grid h-10 w-10 place-items-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        ) : (
          <>
            <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring" aria-label="Smartlearn dashboard">
              <Image src="/smartlearn-logo.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 object-contain" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold leading-none tracking-[-0.02em] text-sidebar-foreground">Smartlearn</span>
                <span className="mt-1 block truncate text-[10px] text-sidebar-foreground/45">Learning workspace</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={onToggle}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-[17px] w-[17px]" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      <nav aria-label="Workspace navigation" className={cn("min-h-0 flex-1 overflow-y-auto py-2", collapsed ? "px-2" : "px-2.5")}>
        {workspaceNavGroups.map((group, groupIndex) => (
          <div key={group.label} className={cn(groupIndex > 0 && (collapsed ? "mt-2 border-t border-sidebar-border pt-2" : "mt-3"))}>
            {!collapsed ? (
              <p className="px-2.5 pb-1 pt-1 text-[10px] font-medium text-sidebar-foreground/45">{group.label}</p>
            ) : null}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = active(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={collapsed ? item.label : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "nav-item group flex min-h-10 items-center rounded-md text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      collapsed ? "justify-center px-2" : "gap-2.5 px-2.5",
                      isActive && "active"
                    )}
                  >
                    <span className="nav-icon-shell"><Icon className="nav-icon h-[17px] w-[17px] shrink-0" aria-hidden="true" /></span>
                    {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
                    {!collapsed && isActive ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        <div className={cn("mt-3 border-t border-sidebar-border pt-3", collapsed && "mt-2 pt-2")}>
          {!collapsed ? <p className="px-2.5 pb-1 text-[10px] font-medium text-sidebar-foreground/45">Account</p> : null}
          <Link
            href="/pricing"
            aria-label={collapsed ? (isPaid ? "Manage plan" : "Plans and upgrade") : undefined}
            title={collapsed ? (isPaid ? "Manage plan" : "Plans and upgrade") : undefined}
            className={cn(
              "nav-item flex min-h-10 items-center rounded-md text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              collapsed ? "justify-center px-2" : "gap-2.5 px-2.5",
              active("/pricing") && "active"
            )}
          >
            <span className="nav-icon-shell"><CreditCard className="nav-icon h-[17px] w-[17px]" aria-hidden="true" /></span>
            {!collapsed ? <span className="min-w-0 flex-1 truncate">{isPaid ? "Manage plan" : "Plans & upgrade"}</span> : null}
            {!collapsed ? <span className={cn("rounded border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider", isPaid ? "border-success/25 bg-success/10 text-success" : "border-primary/25 bg-primary/10 text-primary")}>{PLAN_CATALOG[plan].name}</span> : null}
          </Link>
          <Link
            href="/settings"
            aria-label={collapsed ? "Settings" : undefined}
            title={collapsed ? "Settings" : undefined}
            className={cn("nav-item flex min-h-10 items-center rounded-md text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring", collapsed ? "justify-center px-2" : "gap-2.5 px-2.5", active("/settings") && "active")}
          >
            <span className="nav-icon-shell"><Settings className="nav-icon h-[17px] w-[17px]" aria-hidden="true" /></span>
            {!collapsed ? <span>Settings</span> : null}
          </Link>
          {isAdmin ? (
            <Link
              href="/admin"
              aria-label={collapsed ? "Owner analytics" : undefined}
              title={collapsed ? "Owner analytics" : undefined}
              className={cn("nav-item flex min-h-10 items-center rounded-md text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring", collapsed ? "justify-center px-2" : "gap-2.5 px-2.5", active("/admin") && "active")}
            >
              <span className="nav-icon-shell"><ShieldCheck className="nav-icon h-[17px] w-[17px]" aria-hidden="true" /></span>
              {!collapsed ? <span>Owner analytics</span> : null}
            </Link>
          ) : null}
        </div>
      </nav>

      <div className={cn("border-t border-sidebar-border py-2.5", collapsed ? "px-2" : "px-2.5")}>
        <div className={cn("group flex items-center", collapsed ? "justify-center" : "gap-2")}>
          <Link href="/settings" aria-label={collapsed ? "Open account settings" : undefined} title={collapsed ? "Account settings" : undefined} className={cn("flex min-w-0 items-center rounded-md transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring", collapsed ? "justify-center p-1.5" : "flex-1 gap-2.5 px-2 py-2")}>
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback className="border border-primary/20 bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
            </Avatar>
            {!collapsed ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium leading-none text-sidebar-foreground">{profile?.full_name ?? profile?.email ?? "User"}</p>
                <p className="mt-1 flex items-center gap-1 truncate text-[10px] text-sidebar-foreground/45">
                  {profile?.grade_level ? <><GraduationCap className="h-3 w-3" aria-hidden="true" /> Grade {profile.grade_level}</> : "Account settings"}
                </p>
              </div>
            ) : null}
          </Link>
          {!collapsed ? (
            <button type="button" onClick={handleSignOut} aria-label="Sign out" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-sidebar-foreground/45 opacity-0 transition group-hover:opacity-100 hover:bg-sidebar-accent hover:text-danger focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
