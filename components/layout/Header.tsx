"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  title: string;
  description?: string;
}

export function Header({ title, description }: HeaderProps) {
  return (
    <header className="h-14 border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-10 flex items-center px-6 gap-4">
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-foreground leading-none truncate">{title}</h1>
        {description && (
          <p className="text-xs text-muted-foreground/80 mt-0.5 truncate">{description}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground relative"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-violet-500 rounded-full" />
        </Button>
      </div>
    </header>
  );
}
