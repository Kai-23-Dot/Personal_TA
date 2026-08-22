"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SmartlearnBackdrop } from "@/frontend/components/layout/SmartlearnBackdrop";
import { SmartlearnHeader } from "@/frontend/components/layout/SmartlearnHeader";
import { TurnstileWidget, TURNSTILE_SITE_KEY } from "@/frontend/components/auth/turnstile-widget";
import { AuthFieldLabel } from "@/frontend/components/auth/field-help";

export default function LoginPage() {
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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [accountCreated, setAccountCreated] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const created = params.get("created") === "1";
    setAccountCreated(created);
    setEmailNotVerified(params.get("error") === "email_not_verified");
    if (created) {
      try {
        const pendingEmail = sessionStorage.getItem("pending_verification_email");
        if (pendingEmail) setEmail(pendingEmail);
      } catch {
        // Private browsing can disable web storage; manual entry still works.
      }
    }
  }, []);

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
      if (payload?.code === "EMAIL_NOT_VERIFIED") {
        setEmailNotVerified(true);
      }
      throw new Error(payload?.error ?? "Sign in failed. Please try again.");
    }
    return payload;
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      toast.error("Please complete the human verification first.");
      return;
    }
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(captchaToken ? { captchaToken } : {}),
        }),
      });
      await readAuthResponse(response);
      try {
        sessionStorage.removeItem("pending_verification_email");
      } catch {
        // A completed sign-in does not depend on web storage cleanup.
      }

      const requestedNext = new URLSearchParams(window.location.search).get("next");
      const safeNext =
        requestedNext?.startsWith("/") &&
        !requestedNext.startsWith("//") &&
        !requestedNext.includes("\\")
          ? requestedNext
          : "/dashboard";
      router.push(safeNext);
      router.refresh();
    } catch (error) {
      showAuthFailure(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      toast.error("Enter the email address for the account first.");
      return;
    }
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      toast.error("Please complete the human verification first.");
      return;
    }

    setResending(true);
    try {
      const response = await fetch("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          ...(captchaToken ? { captchaToken } : {}),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not resend the verification email.");
      }
      toast.success(payload?.message ?? "A new verification link is on its way.");
    } catch (error) {
      showAuthFailure(error);
    } finally {
      setResending(false);
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
        showSignIn={false}
        actionLabel="Create account"
        actionHref="/signup"
      />

      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "120px 1.5rem 4rem" }}>
        <div style={{ width: "100%", maxWidth: "420px" }}>
          <div className="contact-form-column" style={{ background: "rgba(255, 255, 255, 0.04)", borderRadius: "20px" }}>
            <h2 className="contact-form-title">Sign in to Smartlearn</h2>

            {accountCreated || emailNotVerified ? (
              <div
                role="status"
                className="mb-5 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-3 text-sm leading-6 text-emerald-100"
              >
                <strong className="block text-emerald-200">Verify your email to activate your account.</strong>
                Open the Smartlearn verification link, then return here to sign in. If the email is missing or expired, enter your address below and{" "}
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resending}
                  className="font-semibold text-sky-300 underline decoration-sky-300/40 underline-offset-2 hover:text-sky-200 disabled:cursor-wait disabled:opacity-60"
                >
                  {resending ? "sending a new link…" : "send a new link"}
                </button>
                .
              </div>
            ) : null}

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

            <form className="contact-form" onSubmit={handleEmailLogin}>
              <div className="form-field">
                <AuthFieldLabel
                  htmlFor="email"
                  label="Email"
                  help="Enter the verified email address connected to your Smartlearn account. New accounts must open the emailed confirmation link before signing in."
                />
                <input
                  id="email"
                  type="email"
                  placeholder="you@school.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  maxLength={254}
                  spellCheck={false}
                  required
                />
              </div>
              <div className="form-field">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem" }}>
                  <AuthFieldLabel
                    htmlFor="password"
                    label="Password"
                    help="Enter the password for this account exactly as created. Passwords are case-sensitive."
                  />
                  <Link href="/forgot-password" style={{ fontSize: "0.85rem" }}>
                    Forgot password?
                  </Link>
                </div>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  maxLength={1024}
                  required
                />
              </div>
              <TurnstileWidget onToken={setCaptchaToken} />
              <button
                type="submit"
                className="contact-submit-btn"
                disabled={loading || (Boolean(TURNSTILE_SITE_KEY) && !captchaToken)}
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
              <p style={{ color: "var(--gray)", fontSize: "0.95rem" }}>
                New here? <Link href="/signup">Create a free account</Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </SmartlearnBackdrop>
  );
}
