"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command, MessageCircle, Radio, Search, ShieldCheck } from "lucide-react";
import { accountNavItems, workspaceNavItems } from "@/frontend/lib/nav-items";

interface HeaderProps {
  title: string;
  description?: string;
  isAdmin?: boolean;
}

export function Header({ title, description, isAdmin = false }: HeaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchItems = useMemo(
    () => [
      ...workspaceNavItems,
      { href: "/chat", label: "AI Assistant", icon: MessageCircle },
      ...accountNavItems,
      ...(isAdmin ? [{ href: "/admin", label: "Owner analytics", icon: ShieldCheck }] : []),
    ],
    [isAdmin]
  );
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return searchItems.slice(0, 6);
    return searchItems.filter((item) => item.label.toLowerCase().includes(normalized)).slice(0, 6);
  }, [query, searchItems]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  function openResult(href: string) {
    setQuery("");
    setSearchOpen(false);
    inputRef.current?.blur();
    router.push(href);
  }

  return (
    <div
      role="banner"
      className="workspace-topbar sticky top-3 z-10 mx-3 mt-3 flex min-h-16 items-center gap-4 rounded-2xl border border-border/70 bg-background/80 px-4 backdrop-blur-2xl sm:mx-5 sm:px-5"
    >
      {/* Logo — visible on mobile (sidebar is hidden on mobile) */}
      <Link
        href="/"
        aria-label="Return to the Smartlearn home page"
        className="flex items-center gap-2 flex-shrink-0 md:hidden"
      >
        <Image
          src="/smartlearn-logo.png"
          alt="Smartlearn"
          width={28}
          height={28}
          className="object-contain"
        />
        <span className="text-sm font-semibold text-foreground">Smartlearn</span>
      </Link>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-none truncate sm:text-base">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground/80 mt-1 hidden truncate xl:block">{description}</p>
        )}
      </div>

      <form
        role="search"
        className="relative hidden w-full max-w-md lg:block"
        onSubmit={(event) => {
          event.preventDefault();
          if (results[0]) openResult(results[0].href);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSearchOpen(false);
        }}
      >
        <div className="flex items-center gap-2 rounded-full border border-border bg-card/70 px-4 py-2 text-sm text-muted-foreground transition focus-within:border-sky-400/60 focus-within:ring-2 focus-within:ring-sky-400/10">
          <Search className="h-4 w-4" />
          <input
            ref={inputRef}
            aria-label="Search workspace"
            placeholder="Jump to courses, notes, assignments..."
            value={query}
            onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"><Command className="h-3 w-3" />K</span>
        </div>

        {searchOpen ? (
          <div className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-border bg-[rgba(8,13,27,0.98)] p-2 shadow-2xl backdrop-blur-2xl">
            {results.length > 0 ? results.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.href}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => openResult(item.href)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-muted-foreground transition hover:bg-sky-500/10 hover:text-sky-100 focus-visible:bg-sky-500/10 focus-visible:text-sky-100 focus-visible:outline-none"
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            }) : (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">No workspace page matches that search.</p>
            )}
          </div>
        ) : null}
      </form>

      <div className="hidden items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-emerald-300 sm:flex">
        <Radio className="h-3 w-3" /> Online
      </div>
    </div>
  );
}
