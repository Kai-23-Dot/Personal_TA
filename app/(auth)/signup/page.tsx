"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConlearnBackdrop } from "@/frontend/components/layout/ConlearnBackdrop";
import { ConlearnHeader } from "@/frontend/components/layout/ConlearnHeader";

export default function SignupPage() {
  const router = useRouter();
  // Optional OAuth providers (comma-separated) for Supabase auth, e.g. "google,azure".
  const oauthProviders = (process.env.NEXT_PUBLIC_OAUTH_PROVIDERS ?? "")
    .split(",")
    .map((provider) => provider.trim())
    .filter(Boolean);
  const oauthLabels: Record<string, string> = {
    google: "Google",
    azure: "Microsoft",
    github: "GitHub",
  };

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  function showAuthFailure(error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not reach the authentication server. Check your connection and Supabase environment settings.";
    toast.error(message);
  }

  async function readAuthResponse(response: Response) {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error ?? "Authentication failed. Please try again.");
    }
    return payload;
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password }),
      });
      await readAuthResponse(response);

      toast.success("Account created! Check your email to confirm.");
      router.push("/login");
    } catch (error) {
      showAuthFailure(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: string) {
    setLoading(true);
    try {
      const response = await fetch("/api/auth/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, redirectTo: `${window.location.origin}/callback` }),
      });
      const payload = await readAuthResponse(response);
      if (typeof payload?.url === "string") {
        window.location.href = payload.url;
        return;
      }
      throw new Error("Could not start OAuth sign in. Please try again.");
    } catch (error) {
      showAuthFailure(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ConlearnBackdrop>
      <ConlearnHeader
        links={[
          { label: "Home", href: "/" },
          { label: "About", href: "/about" },
          { label: "Website", href: "/website" },
          { label: "Contact", href: "/contact" },
        ]}
        showSignIn={false}
      />

      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "120px 1.5rem 4rem" }}>
        <div style={{ width: "100%", maxWidth: "420px" }}>
          <div className="contact-form-column" style={{ background: "rgba(255, 255, 255, 0.04)", borderRadius: "20px" }}>
            <h2 className="contact-form-title">Start free during beta</h2>
            {oauthProviders.length > 0 ? (
              <div className="contact-form" style={{ gap: "0.75rem", marginBottom: "1rem" }}>
                {oauthProviders.map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    className="contact-submit-btn"
                    onClick={() => handleOAuth(provider)}
                    disabled={loading}
                  >
                    Continue with {oauthLabels[provider] ?? provider}
                  </button>
                ))}
              </div>
            ) : null}
            <form className="contact-form" onSubmit={handleSignup}>
              <div className="form-field">
                <label htmlFor="fullName">Full name</label>
                <input
                  id="fullName"
                  type="text"
                  placeholder="Student name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  placeholder="you@school.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  placeholder="Create a secure password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="contact-submit-btn" disabled={loading}>
                {loading ? "Creating account..." : "Create Account"}
              </button>
              <p style={{ color: "var(--gray)", fontSize: "0.95rem" }}>
                Already have an account? <Link href="/login">Sign in here</Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </ConlearnBackdrop>
  );
}
