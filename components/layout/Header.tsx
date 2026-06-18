"use client";

import Link from "next/link";
import { Bell, BookOpen, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  title: string;
  description?: string;
}

export function Header({ title, description }: HeaderProps) {
  return (
    <div
      role="banner"
      className="sticky top-0 z-10 flex min-h-16 items-center gap-4 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl sm:px-6"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-none truncate sm:text-base">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground/80 mt-1 hidden truncate lg:block">{description}</p>
        )}
      </div>

      <label className="hidden w-full max-w-md items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-2 text-sm text-muted-foreground transition focus-within:border-sky-400/60 focus-within:ring-2 focus-within:ring-sky-400/10 lg:flex">
        <Search className="h-4 w-4" />
        <input
          aria-label="Search workspace"
          placeholder="Search courses, notes, assignments..."
          className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Button asChild variant="secondary" size="sm" className="hidden border border-border bg-card/70 sm:inline-flex">
          <Link href="/notes"><BookOpen className="h-4 w-4" /> Notes</Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground relative"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-sky-400 rounded-full" />
        </Button>
        <span className="hidden items-center gap-1 rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-200 xl:inline-flex">
          <Sparkles className="h-3 w-3" /> AI ready
        </span>
      </div>
    </div>
  );
}
