import { cn } from "@/lib/utils";

export function LoadingSkeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton-shimmer rounded-xl", className)} aria-hidden="true" />;
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <LoadingSkeleton className="h-4 w-2/5" />
      <LoadingSkeleton className="mt-3 h-3 w-4/5" />
      <LoadingSkeleton className="mt-6 h-20 w-full" />
    </div>
  );
}
