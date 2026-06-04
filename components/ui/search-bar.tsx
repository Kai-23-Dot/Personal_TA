"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type SearchBarProps = {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function SearchBar({ value, onChange, placeholder = "Search...", className }: SearchBarProps) {
  return (
    <label className={cn("flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition focus-within:border-emerald-400/60 focus-within:ring-2 focus-within:ring-emerald-400/10", className)}>
      <Search className="h-4 w-4" />
      <input
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}
