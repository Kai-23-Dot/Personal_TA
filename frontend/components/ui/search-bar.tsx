"use client";

import { Search } from "lucide-react";
import { cn } from "@/backend/utils";

type SearchBarProps = {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function SearchBar({ value, onChange, placeholder = "Search...", className }: SearchBarProps) {
  return (
    <label className={cn("flex min-h-10 items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm text-muted-foreground transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15", className)}>
      <Search className="h-4 w-4" />
      <input
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}
