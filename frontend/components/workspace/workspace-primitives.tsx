import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/backend/utils";

export type WorkspaceBreadcrumb = {
  label: string;
  href?: string;
};

export function WorkspacePage({
  children,
  className,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "workspace-page mx-auto w-full pb-16",
        wide ? "max-w-[1280px]" : "max-w-[1160px]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function WorkspacePageHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  breadcrumbs,
  action,
  meta,
  className,
}: {
  icon?: LucideIcon;
  eyebrow?: string;
  title: string;
  description?: string;
  breadcrumbs?: WorkspaceBreadcrumb[];
  action?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("workspace-page-header border-b border-border pb-6", className)}>
      {breadcrumbs?.length ? (
        <nav aria-label="Breadcrumb" className="mb-4 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          {breadcrumbs.map((item, index) => (
            <span key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 ? <ChevronRight className="h-3 w-3 shrink-0 opacity-55" aria-hidden="true" /> : null}
              {item.href ? (
                <Link href={item.href} className="truncate rounded px-1 py-0.5 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {item.label}
                </Link>
              ) : (
                <span className="truncate px-1 py-0.5 text-foreground/80" aria-current="page">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}

      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          {Icon ? (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-1 text-primary">
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? <p className="mb-1 text-xs font-medium text-muted-foreground">{eyebrow}</p> : null}
            <h1 className="text-[clamp(1.875rem,4vw,2.25rem)] font-semibold leading-[1.12] tracking-[-0.04em] text-foreground">
              {title}
            </h1>
            {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
            {meta ? <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{meta}</div> : null}
          </div>
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </header>
  );
}

export function WorkspaceSectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-[-0.02em] text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function WorkspaceSurface({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn("workspace-surface overflow-hidden rounded-lg border border-border bg-card", className)}
      data-workspace-surface
      {...props}
    >
      {children}
    </section>
  );
}

export function WorkspaceToolbar({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("workspace-toolbar flex min-w-0 flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

export function StatusTag({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  className?: string;
}) {
  const tones = {
    neutral: "border-border bg-surface-1 text-muted-foreground",
    accent: "border-primary/25 bg-primary/10 text-primary",
    success: "border-success/25 bg-success/10 text-success",
    warning: "border-warning/25 bg-warning/10 text-warning",
    danger: "border-danger/25 bg-danger/10 text-danger",
  };
  return (
    <span className={cn("inline-flex min-h-6 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

export function DataRow({
  className,
  children,
  selected = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { selected?: boolean }) {
  return (
    <div
      className={cn(
        "workspace-data-row border-b border-border px-4 py-3 transition-colors duration-150 last:border-b-0 hover:bg-surface-2/70",
        selected && "bg-accent/70",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
