"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/backend/utils";
import {
  CreditCard,
  GraduationCap,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/backend/supabase/client";
import { useRouter } from "next/navigation";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/frontend/components/ui/avatar";
import type { Profile } from "@/types";
import { toast } from "sonner";
import { workspaceNavItems as navItems } from "@/frontend/lib/nav-items";
import { PLAN_CATALOG, type Plan } from "@/backend/billing/plans";
import { OPEN_SEARCH_EVENT } from "@/frontend/lib/workspace-search";

interface SidebarProps {
  profile: Profile | null;
  plan?: Plan;
  isAdmin?: boolean;
}

export function Sidebar({
  profile,
  plan = "free",
  isAdmin = false,
}: SidebarProps) {
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
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : (profile?.email?.[0]?.toUpperCase() ?? "U");

  return (
    <aside className="workspace-sidebar fixed inset-y-0 left-0 z-20 hidden w-60 flex-col md:flex">
      <div className="sidebar-brand">
        <Link
          href="/"
          aria-label="Return to the Smartlearn home page"
          className="flex flex-1 items-center gap-2 rounded-[3px] px-1 py-1"
        >
          <div className="h-[22px] w-[22px] flex-shrink-0 overflow-hidden">
            <Image
              src="/smartlearn-logo.png"
              alt="Smartlearn"
              width={22}
              height={22}
              className="h-full w-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <div className="sidebar-brand-name truncate">Smartlearn</div>
            <div className="sidebar-brand-caption truncate">Learning workspace</div>
          </div>
        </Link>
      </div>

      {/* Search lives in the rail rather than the top bar, the way it does in
          Notion — it opens the same ⌘K overlay the shortcut does, and gives the
          page back the vertical space the old search field occupied. */}
      <div className="px-2 pb-1">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT))}
          className="nav-item w-full"
        >
          <Search className="nav-icon" aria-hidden="true" />
          <span className="flex-1 text-left">Search</span>
          <span className="kbd" aria-hidden="true">⌘K</span>
        </button>
      </div>

      <div
        role="navigation"
        aria-label="Workspace navigation"
        className="flex-1 overflow-y-auto px-2 pb-3"
      >
        <p className="nav-label">Workspace</p>
        {navItems.map((item, index) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <div key={item.href}>
              {index === 4 ? (
                <p className="nav-label">Learn &amp; grow</p>
              ) : index === 8 ? (
                <p className="nav-label">Your progress</p>
              ) : null}
              <Link
                aria-current={isActive ? "page" : undefined}
                href={item.href}
                className={cn("nav-item", isActive && "active")}
              >
                <Icon className="nav-icon" aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
              </Link>
            </div>
          );
        })}

        <div className="my-2 px-2">
          <hr className="divider" />
        </div>

        <Link
          href="/pricing"
          className={cn("nav-item", pathname === "/pricing" && "active")}
        >
          <CreditCard className="nav-icon" aria-hidden="true" />
          <span className="flex-1">{isPaid ? "Manage plan" : "Plans & upgrade"}</span>
          <span className={cn("plan-badge", isPaid && "plan-badge--paid")}>
            {PLAN_CATALOG[plan].name}
          </span>
        </Link>
        <Link
          href="/settings"
          className={cn("nav-item", pathname === "/settings" && "active")}
        >
          <Settings className="nav-icon" aria-hidden="true" />
          <span className="flex-1">Settings</span>
        </Link>
        {isAdmin ? (
          <Link
            href="/admin"
            className={cn("nav-item", pathname === "/admin" && "active")}
          >
            <ShieldCheck className="nav-icon" aria-hidden="true" />
            <span className="flex-1">Owner analytics</span>
          </Link>
        ) : null}
      </div>

      <div className="sidebar-footer">
        <div className="group flex items-center gap-1">
          <Link href="/settings" className="nav-item min-w-0 flex-1">
            <Avatar className="h-[22px] w-[22px] flex-shrink-0">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback className="avatar-fallback">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium leading-tight">
                {profile?.full_name ?? profile?.email ?? "User"}
              </span>
              {profile?.grade_level ? (
                <span className="mt-0.5 flex items-center gap-1 text-[12px] leading-tight text-[var(--ink-faint)]">
                  <GraduationCap className="h-3 w-3" />
                  Grade {profile.grade_level}
                </span>
              ) : (
                <span className="mt-0.5 block text-[12px] leading-tight text-[var(--ink-faint)]">
                  Settings
                </span>
              )}
            </span>
          </Link>
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            className="sign-out"
          >
            <LogOut className="h-[15px] w-[15px]" />
          </button>
        </div>
      </div>
    </aside>
  );
}
