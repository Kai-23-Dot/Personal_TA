"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="section">
      <h2 className="animate-on-scroll">We hit a snag</h2>
      <p style={{ color: "var(--gray)" }}>
        {error?.message || "Something went wrong while loading this page."}
      </p>
      <button className="btn btn-secondary" type="button" onClick={reset}>
        Retry
      </button>
    </section>
  );
}
