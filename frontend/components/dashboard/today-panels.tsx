import Link from "next/link";
import { ArrowRight, Brain, CheckCircle2, Clock3, FileStack, Flame, Sparkles, Timer, Zap } from "lucide-react";
import { cn } from "@/backend/utils";
import { Button } from "@/frontend/components/ui/button";
import { StatusTag, WorkspaceSectionHeader, WorkspaceSurface } from "@/frontend/components/workspace/workspace-primitives";
import type { DashboardPrimaryAction } from "./dashboard-types";

export function RecommendedNext({ action }: { action: DashboardPrimaryAction }) {
  const tone = {
    urgent: "border-l-warning text-warning",
    focus: "border-l-primary text-primary",
    clear: "border-l-success text-success",
  }[action.tone];
  return (
    <WorkspaceSurface className={cn("border-l-2", tone.split(" ")[0])} aria-labelledby="recommended-next-title">
      <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-md bg-current/10", tone.split(" ")[1])}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Recommended next</p>
            <StatusTag tone={action.tone === "urgent" ? "warning" : action.tone === "clear" ? "success" : "accent"}>{action.badge}</StatusTag>
          </div>
          <h2 id="recommended-next-title" className="mt-1 truncate text-base font-semibold tracking-[-0.02em] text-foreground sm:text-lg">{action.title}</h2>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{action.description}</p>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{action.meta.map((item) => <span key={item}>{item}</span>)}</p>
        </div>
        <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
          {action.secondaryHref ? <Button asChild variant="secondary" className="h-11 sm:h-10"><Link href={action.secondaryHref}>{action.secondaryLabel}</Link></Button> : null}
          <Button asChild className="h-11 sm:h-10"><Link href={action.href}>{action.cta}<ArrowRight className="h-4 w-4" /></Link></Button>
        </div>
      </div>
    </WorkspaceSurface>
  );
}

export function StudyOverview({
  dueCount,
  streak,
  focusHours,
  materialCount,
  courseCount,
  hasPracticeHistory,
}: {
  dueCount: number;
  streak: number;
  focusHours: number;
  materialCount: number;
  courseCount: number;
  hasPracticeHistory: boolean;
}) {
  const metrics = [
    { icon: Clock3, label: "Due this week", value: String(dueCount) },
    { icon: Flame, label: "Study streak", value: `${streak}d` },
    { icon: Timer, label: "Focus time", value: `${focusHours}h` },
    { icon: FileStack, label: "Indexed", value: String(materialCount) },
  ];
  return (
    <WorkspaceSurface>
      <WorkspaceSectionHeader title="Study overview" description={`${courseCount} active course${courseCount === 1 ? "" : "s"}`} />
      <dl className="grid grid-cols-2 border-b border-border">
        {metrics.map(({ icon: Icon, label, value }, index) => (
          <div key={label} className={cn("p-3.5", index % 2 === 0 && "border-r border-border", index < 2 && "border-b border-border")}>
            <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="p-2">
        <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Quick actions</p>
        <QuietAction href={hasPracticeHistory ? "/practice" : "/review"} icon={Zap} label={hasPracticeHistory ? "Continue last practice" : "Open review queue"} />
        <QuietAction href="/practice" icon={Brain} label="Create practice" />
        <QuietAction href="/focus" icon={Timer} label="Start focus session" />
      </div>
    </WorkspaceSurface>
  );
}

function QuietAction({ href, icon: Icon, label }: { href: string; icon: typeof Brain; label: string }) {
  return (
    <Link href={href} className="group flex min-h-11 items-center gap-2.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ArrowRight className="h-3.5 w-3.5 opacity-45 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

export function EmptyUpcoming() {
  return <div className="px-4 py-8 text-center"><CheckCircle2 className="mx-auto h-5 w-5 text-success" /><p className="mt-2 text-sm font-medium">No upcoming deadlines</p><p className="mt-1 text-xs text-muted-foreground">Your current week is clear.</p></div>;
}
