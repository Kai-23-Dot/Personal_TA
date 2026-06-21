import { CardSkeleton } from "@/frontend/components/ui/loading-skeleton";

export default function GlobalLoading() {
  return (
    <section className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </section>
  );
}
