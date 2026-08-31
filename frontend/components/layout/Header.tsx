"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Command, Link2, Menu, Search } from "lucide-react";
import { accountNavItems, workspaceNavGroups } from "@/frontend/lib/nav-items";
import { WorkspaceCommandPalette } from "@/frontend/components/workspace/command-palette";

interface HeaderProps {
  isAdmin?: boolean;
  canvasConnection?: { id: string; last_synced_at: string | null } | null;
  onOpenMobileNavigation: () => void;
}

function syncLabel(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return "Canvas connected · not synced yet";
  const timestamp = Date.parse(lastSyncedAt);
  if (!Number.isFinite(timestamp)) return "Canvas connected";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Canvas synced just now";
  if (minutes < 60) return `Canvas synced ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Canvas synced ${hours}h ago`;
  return `Canvas synced ${Math.floor(hours / 24)}d ago`;
}

export function Header({ canvasConnection = null, onOpenMobileNavigation }: HeaderProps) {
  const pathname = usePathname();
  const [commandOpen, setCommandOpen] = useState(false);

  const breadcrumb = useMemo(() => {
    const groups = [...workspaceNavGroups, { label: "Account", items: accountNavItems }];
    const group = groups.find((candidate) => candidate.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)));
    const item = group?.items.find((candidate) => pathname === candidate.href || pathname.startsWith(`${candidate.href}/`));
    return {
      group: group?.label ?? "Workspace",
      item: item ?? { href: "/dashboard", label: "Dashboard" },
      detail: item && pathname !== item.href ? "Details" : null,
    };
  }, [pathname]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <>
      <header className="workspace-topbar sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background px-3 sm:px-5">
        <button
          type="button"
          onClick={onOpenMobileNavigation}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          aria-label="Open full navigation menu"
        >
          <Menu className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>

        <Link href="/dashboard" className="flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden" aria-label="Smartlearn dashboard">
          <Image src="/smartlearn-logo.png" alt="" width={25} height={25} className="h-[25px] w-[25px] object-contain" />
          <span className="text-sm font-semibold text-foreground">Smartlearn</span>
        </Link>

        <nav aria-label="Current location" className="hidden min-w-0 flex-1 items-center gap-1 text-xs text-muted-foreground md:flex">
          <span className="truncate">{breadcrumb.group}</span>
          <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
          <Link href={breadcrumb.item.href} className="truncate rounded px-1 py-0.5 text-foreground/80 hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {breadcrumb.item.label}
          </Link>
          {breadcrumb.detail ? <><ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" /><span className="truncate">{breadcrumb.detail}</span></> : null}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex h-11 items-center gap-2 rounded-md border border-input bg-card px-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10 sm:min-w-56 sm:px-3 lg:min-w-72"
            aria-label="Search Smartlearn with Command K"
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden min-w-0 flex-1 truncate text-left sm:inline">Search workspace…</span>
            <kbd className="hidden items-center gap-1 rounded border border-border bg-surface-1 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
              <Command className="h-3 w-3" aria-hidden="true" />K
            </kbd>
          </button>

          <Link
            href="/settings"
            className="grid h-11 w-11 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-10 sm:w-10"
            aria-label={canvasConnection ? syncLabel(canvasConnection.last_synced_at) : "Canvas is not connected"}
            title={canvasConnection ? syncLabel(canvasConnection.last_synced_at) : "Canvas is not connected"}
          >
            <span className="relative">
              <Link2 className="h-[17px] w-[17px]" aria-hidden="true" />
              <span className={`absolute -right-1 -top-1 h-2 w-2 rounded-full border-2 border-background ${canvasConnection ? "bg-success" : "bg-warning"}`} aria-hidden="true" />
            </span>
          </Link>
        </div>
      </header>
      <WorkspaceCommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  );
}
