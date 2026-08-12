"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ConlearnBackdrop } from "@/frontend/components/layout/ConlearnBackdrop";
import { ConlearnHeader } from "@/frontend/components/layout/ConlearnHeader";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not request a reset link.");
      }
      setSent(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not request a reset link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ConlearnBackdrop>
      <ConlearnHeader links={[{ label: "Home", href: "/" }]} showSignIn={false} />
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "120px 1.5rem 4rem" }}>
        <section className="contact-form-column" style={{ width: "100%", maxWidth: 420, background: "rgba(255, 255, 255, 0.04)", borderRadius: 20 }}>
          <h1 className="contact-form-title">Reset your password</h1>
          {sent ? (
            <div className="contact-form">
              <p style={{ color: "var(--gray)" }}>
                If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.
              </p>
              <Link href="/login">Return to sign in</Link>
            </div>
          ) : (
            <form className="contact-form" onSubmit={submit}>
              <p style={{ color: "var(--gray)" }}>
                Enter the email used for your Conlearn account.
              </p>
              <div className="form-field">
                <label htmlFor="reset-email">Email</label>
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <button className="contact-submit-btn" type="submit" disabled={loading}>
                {loading ? "Sending..." : "Send reset link"}
              </button>
              <Link href="/login">Back to sign in</Link>
            </form>
          )}
        </section>
      </main>
    </ConlearnBackdrop>
  );
}
