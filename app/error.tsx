"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <section style={{ padding: "2rem", color: "#f3f4f6", background: "#0b0b12", minHeight: "100vh" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>Something went wrong</h1>
          <p style={{ color: "#9ca3af", marginBottom: "1.5rem" }}>
            {error?.message || "Unexpected error. Please try again."}
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "0.7rem 1.2rem",
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.2)",
              background: "linear-gradient(120deg, #00e5ff, #ff4dff)",
              color: "#0b0b12",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </section>
      </body>
    </html>
  );
}
