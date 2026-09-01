"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/backend/utils";
import { CreditCard, GraduationCap, LogOut, Settings, ShieldCheck } from "lucide-react";
import { createClient } from "@/backend/supabase/client";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/frontend/components/ui/avatar";
import type { Profile } from "@/types";
import { toast } from "sonner";
import { workspaceNavItems as navItems } from "@/frontend/lib/nav-items";
import { PLAN_CATALOG, type Plan } from "@/backend/billing/plans";

interface SidebarProps {
  profile: Profile | null;
  plan?: Plan;
  isAdmin?: boolean;
}

export function Sidebar({ profile, plan = "free", isAdmin = false }: SidebarProps) {
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
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : profile?.email?.[0]?.toUpperCase() ?? "U";

  return (
    <aside className="workspace-sidebar fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar/95 backdrop-blur-xl md:flex">
      <div className="border-b border-sidebar-border px-4 py-3.5">
        <Link
          href="/"
          aria-label="Return to the Smartlearn home page"
          className="group flex items-center gap-2.5 rounded-md px-1 py-1"
        >
          <div className="w-8 h-8 flex-shrink-0 overflow-hidden transition-all duration-300 group-hover:scale-105">
            <Image
              src="/smartlearn-logo.png"
              alt="Smartlearn"
              width={32}
              height={32}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-none tracking-[-0.02em] text-sidebar-foreground">Smartlearn</div>
            <div className="mt-1 text-[9px] uppercase tracking-[0.15em] text-primary/50">Learning workspace</div>
          </div>
        </Link>
      </div>

      <div role="navigation" aria-label="Workspace navigation" className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
        <p className="px-2.5 pb-1.5 pt-2 text-[10px] font-medium text-sidebar-foreground/35">
          Workspace
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("nav-item flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium", isActive && "active")}
            >
              <span className="nav-icon-shell"><Icon className={cn("nav-icon w-[15px] h-[15px] flex-shrink-0")} /></span>
              <span className="flex-1">{item.label}</span>
              {isActive ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300" /> : null}
            </Link>
          );
        })}

        <div className="pt-3">
          <p className="px-2.5 pb-1.5 pt-2 text-[10px] font-medium text-sidebar-foreground/35">
            Account
          </p>
          <Link
            href="/pricing"
            className={cn(
              "mb-1 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
              isPaid
                ? "text-emerald-100 hover:bg-white/[0.045]"
                : "text-sidebar-foreground/70 hover:bg-white/[0.045] hover:text-sidebar-foreground",
              pathname === "/pricing" && "bg-sky-400/[0.10] text-sky-100"
            )}
          >
            <span className="nav-icon-shell"><CreditCard className="nav-icon h-[15px] w-[15px] flex-shrink-0" /></span>
            <span className="flex-1">{isPaid ? "Manage plan" : "Plans & upgrade"}</span>
            <span className={cn(
              "rounded border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider",
              isPaid
                ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
                : "border-sky-300/25 bg-sky-400/10 text-sky-200"
            )}>
              {PLAN_CATALOG[plan].name}
            </span>
          </Link>
          <Link
            href="/settings"
            className={cn("nav-item flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium", pathname === "/settings" && "active")}
          >
            <Settings className={cn("nav-icon w-[15px] h-[15px] flex-shrink-0")} />
            Settings
          </Link>
          {isAdmin ? (
            <Link
              href="/admin"
              className={cn("nav-item flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium", pathname === "/admin" && "active")}
            >
              <ShieldCheck className="nav-icon h-[15px] w-[15px] flex-shrink-0" />
              Owner analytics
            </Link>
          ) : null}
        </div>
      </div>

      {/* User */}
      <div className="border-t border-sidebar-border px-2.5 py-2.5">
        <div className="group flex items-center gap-3 rounded-md transition-colors duration-150">
          <Link
            href="/settings"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-2 transition-colors duration-150 hover:bg-white/[0.045]"
          >
            <Avatar className="w-7 h-7 flex-shrink-0">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-sky-500/15 text-sky-200 text-xs font-semibold border border-sky-400/20">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sidebar-foreground text-[13px] font-medium truncate leading-none">
                {profile?.full_name ?? profile?.email ?? "User"}
              </p>
              {profile?.grade_level ? (
                <p className="text-sidebar-foreground/35 text-[11px] flex items-center gap-1 mt-0.5">
                  <GraduationCap className="w-3 h-3" />
                  Grade {profile.grade_level}
                </p>
              ) : (
                <p className="text-sidebar-foreground/35 text-[11px] mt-0.5">Settings</p>
              )}
            </div>
          </Link>
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            className="mr-1 text-sidebar-foreground/40 hover:text-rose-500 transition-colors duration-150 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/5"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
