"use client";

import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";

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
      {/* Logo — visible on mobile (sidebar is hidden on mobile) */}
      <Link href="/dashboard" className="flex items-center gap-2 flex-shrink-0 md:hidden">
        <Image
          src="/conlearn-logo.png"
          alt="Conlearn"
          width={28}
          height={28}
          className="object-contain"
        />
        <span className="text-sm font-semibold text-foreground">Conlearn</span>
      </Link>

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
    </div>
  );
}
