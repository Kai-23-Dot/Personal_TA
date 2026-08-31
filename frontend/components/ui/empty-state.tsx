import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/backend/utils";

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon: Icon = Sparkles, action, className }: EmptyStateProps) {
  return (
    <div className={cn("rounded-lg border border-dashed border-border bg-card p-8 text-center", className)}>
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
