"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Search, ShieldCheck } from "lucide-react";
import { accountNavItems, workspaceNavItems } from "@/frontend/lib/nav-items";
import { OPEN_SEARCH_EVENT } from "@/frontend/lib/workspace-search";

interface HeaderProps {
  title: string;
  description?: string;
  isAdmin?: boolean;
}

export function Header({ title, description, isAdmin = false }: HeaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [scrolled, setScrolled] = useState(false);

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
    if (!normalized) return searchItems.slice(0, 7);
    return searchItems.filter((item) => item.label.toLowerCase().includes(normalized)).slice(0, 7);
  }, [query, searchItems]);

  const openSearch = useCallback(() => {
    setOpen(true);
    setCursor(0);
    // The input mounts with the overlay, so focus has to wait a frame.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery("");
    setCursor(0);
  }, []);

  // ⌘K from anywhere, and the rail's Search row via the shared window event.
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    window.addEventListener(OPEN_SEARCH_EVENT, openSearch);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
      window.removeEventListener(OPEN_SEARCH_EVENT, openSearch);
    };
  }, [openSearch]);

  // The top bar carries no rule until content passes under it.
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 4);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function openResult(href: string) {
    closeSearch();
    router.push(href);
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => (results.length ? (c + 1) % results.length : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => (results.length ? (c - 1 + results.length) % results.length : 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const target = results[cursor];
      if (target) openResult(target.href);
    }
  }

  return (
    <>
      <div
        role="banner"
        data-scrolled={scrolled ? "true" : "false"}
        className="workspace-topbar sticky top-0 z-10 flex items-center gap-3 px-4 sm:px-6"
      >
        {/* The rail is hidden on mobile, so the wordmark stands in for it. */}
        <Link
          href="/"
          aria-label="Return to the Smartlearn home page"
          className="flex flex-shrink-0 items-center gap-2 md:hidden"
        >
          <Image
            src="/smartlearn-logo.png"
            alt="Smartlearn"
            width={22}
            height={22}
            className="object-contain"
          />
          <span className="topbar-title">Smartlearn</span>
        </Link>

        <div className="min-w-0 flex-1">
          <p className="topbar-title truncate">{title}</p>
          {description ? (
            <p className="sr-only">{description}</p>
          ) : null}
        </div>

        {/* Mobile gets a search affordance here since it has no rail. */}
        <button
          type="button"
          onClick={openSearch}
          aria-label="Search workspace"
          className="topbar-action md:hidden"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>

      {open ? (
        <div
          className="search-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSearch();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search workspace"
            className="search-panel"
          >
            <div className="search-field" role="search">
              <Search className="h-4 w-4 flex-shrink-0 text-[var(--ink-faint)]" />
              <input
                ref={inputRef}
                aria-label="Search workspace"
                placeholder="Jump to courses, notes, assignments..."
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCursor(0);
                }}
                onKeyDown={onSearchKeyDown}
              />
              <span className="kbd">Esc</span>
            </div>

            <div className="search-results">
              {results.length > 0 ? (
                results.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      type="button"
                      onMouseEnter={() => setCursor(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => openResult(item.href)}
                      data-active={index === cursor ? "true" : "false"}
                      className="search-result"
                    >
                      <Icon className="h-4 w-4 flex-shrink-0 text-[var(--ink-faint)]" />
                      <span>{item.label}</span>
                    </button>
                  );
                })
              ) : (
                <p className="search-empty">
                  No page matches “{query.trim()}”. Try a course, note, or assignment name.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
