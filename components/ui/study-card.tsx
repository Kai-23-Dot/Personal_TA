import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type StudyCardProps = {
  title: string;
  description: string;
  href?: string;
  icon?: LucideIcon;
  meta?: string;
  className?: string;
};

export function StudyCard({ title, description, href, icon: Icon, meta, className }: StudyCardProps) {
  const content = (
    <div className={cn("group rounded-2xl border border-border bg-card p-5 transition hover:border-sky-400/35 hover:bg-secondary/50", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {Icon ? (
            <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-500/10 text-sky-300">
              <Icon className="h-4 w-4" />
            </div>
          ) : null}
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description}</p>
          {meta ? <p className="mt-4 text-xs text-muted-foreground">{meta}</p> : null}
        </div>
        {href ? <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-sky-300" /> : null}
      </div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}
