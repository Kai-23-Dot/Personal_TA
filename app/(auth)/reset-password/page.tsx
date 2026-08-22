"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SmartlearnBackdrop } from "@/frontend/components/layout/SmartlearnBackdrop";
import { SmartlearnHeader } from "@/frontend/components/layout/SmartlearnHeader";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not update your password.");
      }
      toast.success("Password updated.");
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SmartlearnBackdrop>
      <SmartlearnHeader showSignIn />
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "120px 1.5rem 4rem" }}>
        <section className="contact-form-column" style={{ width: "100%", maxWidth: 420, background: "rgba(255, 255, 255, 0.04)", borderRadius: 20 }}>
          <h1 className="contact-form-title">Choose a new password</h1>
          <form className="contact-form" onSubmit={submit}>
            <div className="form-field">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
              />
            </div>
            <button className="contact-submit-btn" type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update password"}
            </button>
          </form>
        </section>
      </main>
    </SmartlearnBackdrop>
  );
}
