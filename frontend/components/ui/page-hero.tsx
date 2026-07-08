import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/backend/utils";
import { Card } from "./card";

/**
 * Standard top-of-page header: icon badge + title + one-line description.
 * Use on every workspace page so switching tabs always tells you what the
 * page does, instead of a bare heading on some pages and nothing on others.
 */
export function PageHero({
  icon: Icon,
  badgeLabel,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  badgeLabel: string;
  title: string;
  description: string;
  /** Optional buttons/controls rendered alongside the title on wide screens. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card variant="hero" className={cn("p-6", className)}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-100">
            <Icon className="h-3.5 w-3.5" /> {badgeLabel}
          </p>
          <h1 className="font-sora text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        {action && <div className="flex flex-wrap gap-2.5 md:flex-shrink-0">{action}</div>}
      </div>
    </Card>
  );
}
