"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SmartlearnBackdrop } from "@/frontend/components/layout/SmartlearnBackdrop";
import { SmartlearnHeader } from "@/frontend/components/layout/SmartlearnHeader";
import { TurnstileWidget, TURNSTILE_SITE_KEY } from "@/frontend/components/auth/turnstile-widget";

export default function SignupPage() {
  const router = useRouter();
  // Optional OAuth providers (comma-separated) for Supabase auth, e.g. "google,azure".
  const oauthProviders = (process.env.NEXT_PUBLIC_OAUTH_PROVIDERS ?? "")
    .split(",")
    .map((provider) => provider.trim())
    .filter(Boolean);
  const oauthLabels: Record<string, string> = {
    azure: "Microsoft",
    github: "GitHub",
  };
  // Keep Google auth hidden for now; other configured providers remain available.
  const otherProviders = oauthProviders.filter((provider) => provider !== "google");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

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
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    if (TURNSTILE_SITE_KEY && !captchaToken) {
      toast.error("Please complete the human verification first.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: trimmedUsername,
          email,
          password,
          ...(captchaToken ? { captchaToken } : {}),
        }),
      });
      const payload = await readAuthResponse(response);

      if (payload?.hasSession) {
        // Email confirmation is off for this project, so signup already returned
        // an active session — go straight in instead of making them log in again.
        router.push("/dashboard");
        router.refresh();
      } else {
        toast.success("Account created! Check your email to confirm.");
        router.push("/login");
      }
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
    <SmartlearnBackdrop>
      <SmartlearnHeader
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
            <h2 className="contact-form-title">Sign Up</h2>

            {otherProviders.length > 0 ? (
              <>
                <div className="contact-form" style={{ gap: "0.75rem", marginBottom: "1rem" }}>
                  {otherProviders.map((provider) => (
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
              </>
            ) : null}

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
                  minLength={8}
                  required
                />
              </div>
              <TurnstileWidget onToken={setCaptchaToken} />
              <button
                type="submit"
                className="contact-submit-btn"
                disabled={loading || (Boolean(TURNSTILE_SITE_KEY) && !captchaToken)}
              >
                {loading ? "Creating account..." : "Create Account"}
              </button>
              <p style={{ color: "var(--gray)", fontSize: "0.95rem" }}>
                Already have an account? <Link href="/login">Sign in here</Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </SmartlearnBackdrop>
  );
}
