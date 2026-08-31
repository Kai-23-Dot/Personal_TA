import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/backend/utils";
import { WorkspacePageHeader } from "@/frontend/components/workspace/workspace-primitives";

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
    <WorkspacePageHeader
      className={cn("mb-6", className)}
      icon={Icon}
      eyebrow={badgeLabel}
      title={title}
      description={description}
      action={action}
    />
  );
}
