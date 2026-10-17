"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SmartlearnBackdrop } from "@/frontend/components/layout/SmartlearnBackdrop";
import { SmartlearnHeader } from "@/frontend/components/layout/SmartlearnHeader";
import { TurnstileWidget, TURNSTILE_SITE_KEY } from "@/frontend/components/auth/turnstile-widget";
import { AuthFieldLabel } from "@/frontend/components/auth/field-help";
import { GoogleIcon } from "@/frontend/components/auth/GoogleIcon";

export default function SignupPage() {
  const router = useRouter();
  // Google is always available; the environment can enable additional providers.
  const oauthProviders = Array.from(new Set([
    "google",
    ...(process.env.NEXT_PUBLIC_OAUTH_PROVIDERS ?? "")
      .split(",")
      .map((provider) => provider.trim())
      .filter((provider) => ["google", "github", "azure"].includes(provider)),
  ]));
  const oauthLabels: Record<string, string> = {
    google: "Google",
    azure: "Microsoft",
    github: "GitHub",
  };

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOAuthLoading] = useState<string | null>(null);
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
      await readAuthResponse(response);
      try {
        sessionStorage.setItem("pending_verification_email", email.trim());
      } catch {
        // The login screen still lets the user type the address manually.
      }
      toast.success("Verification email sent. Open the link to activate your account.");
      router.push("/login?created=1&next=%2Fonboarding%3Fwelcome%3D1");
    } catch (error) {
      showAuthFailure(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: string) {
    setLoading(true);
    setOAuthLoading(provider);
    try {
      const response = await fetch("/api/auth/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          redirectTo: `${window.location.origin}/callback?next=${encodeURIComponent("/onboarding?welcome=1")}`,
        }),
      });
      const payload = await readAuthResponse(response);
      if (typeof payload?.url === "string") {
        window.location.href = payload.url;
        return;
      }
      throw new Error("Could not start OAuth sign in. Please try again.");
    } catch (error) {
      showAuthFailure(error);
      setLoading(false);
      setOAuthLoading(null);
    }
  }

  return (
    <SmartlearnBackdrop>
      <SmartlearnHeader
        showSignIn
      />

      <main className="auth-main">
        <div style={{ width: "100%", maxWidth: "420px" }}>
          <div className="contact-form-column">
            <h2 className="contact-form-title">Sign Up</h2>

            {oauthProviders.length > 0 ? (
              <>
                <div className="oauth-provider-list">
                  {oauthProviders.map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      className="oauth-provider-btn"
                      onClick={() => handleOAuth(provider)}
                      disabled={loading}
                      aria-busy={oauthLoading === provider}
                    >
                      {provider === "google" ? <GoogleIcon /> : null}
                      <span>{oauthLoading === provider
                        ? `Connecting to ${oauthLabels[provider]}…`
                        : `Continue with ${oauthLabels[provider]}`}</span>
                    </button>
                  ))}
                </div>

                <div className="auth-divider">or</div>
              </>
            ) : null}

            <form className="contact-form" onSubmit={handleSignup}>
              <div className="form-field">
                <AuthFieldLabel
                  htmlFor="username"
                  label="Username"
                  help="Use 3–50 characters. Letters, numbers, spaces, periods, apostrophes, underscores, and hyphens are allowed."
                />
                <input
                  id="username"
                  type="text"
                  placeholder="Choose a username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  minLength={3}
                  maxLength={50}
                  autoComplete="username"
                  spellCheck={false}
                  required
                />
              </div>
              <div className="form-field">
                <AuthFieldLabel
                  htmlFor="email"
                  label="Email"
                  help="Use an inbox you can open now. Smartlearn sends a verification link, and the account cannot sign in until that link is opened."
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
                <AuthFieldLabel
                  htmlFor="password"
                  label="Password"
                  help="Use 8–128 characters. A unique passphrase is recommended; passwords are case-sensitive."
                />
                <input
                  id="password"
                  type="password"
                  placeholder="Create a secure password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
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
      </main>
    </SmartlearnBackdrop>
  );
}
