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

  const [username, setUsername] = useState("");
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

    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      toast.error("Username must be at least 3 characters.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUsername, email, password }),
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

            {/* Google sign-up — creates the account automatically on first use */}
            <div className="contact-form" style={{ gap: "0.75rem", marginBottom: "1rem" }}>
              <button
                type="button"
                onClick={() => handleOAuth("google")}
                disabled={loading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.65rem",
                  width: "100%",
                  padding: "0.75rem 1rem",
                  borderRadius: "10px",
                  background: "#ffffff",
                  color: "#1f2328",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  border: "1px solid rgba(255,255,255,0.25)",
                  cursor: loading ? "default" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  transition: "opacity 0.15s ease, transform 0.15s ease",
                }}
              >
                <GoogleIcon />
                Sign up with Google
              </button>

              {oauthProviders
                .filter((provider) => provider !== "google")
                .map((provider) => (
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

            {/* Divider */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                margin: "0 0 1rem",
                color: "var(--gray)",
                fontSize: "0.8rem",
              }}
            >
              <span style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.12)" }} />
              or
              <span style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.12)" }} />
            </div>

            <form className="contact-form" onSubmit={handleSignup}>
              <div className="form-field">
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  type="text"
                  placeholder="Choose a username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  minLength={3}
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
