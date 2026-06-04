import { CardSkeleton } from "@/components/ui/loading-skeleton";

export default function DashboardLoading() {
  return (
    <section className="section">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading workspace">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </section>
  );
}
