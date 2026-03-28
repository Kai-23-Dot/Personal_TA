"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { PersonalTABackdrop } from "@/components/layout/PersonalTABackdrop";
import { PersonalTAHeader } from "@/components/layout/PersonalTAHeader";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
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

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    toast.success("Account created! Check your email to confirm.");
    router.push("/login");
  }

  async function handleOAuth(provider: string) {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider as "google" | "github" | "azure",
      options: { redirectTo: `${window.location.origin}/callback` },
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
    }
  }

  return (
    <PersonalTABackdrop>
      <PersonalTAHeader
        links={[
          { label: "Home", href: "/" },
          { label: "About", href: "/about" },
          { label: "Website", href: "/website" },
          { label: "Contact", href: "/contact" },
        ]}
        showSignIn={false}
      />

      <section className="section" style={{ paddingTop: "120px" }}>
        <h2 className="animate-on-scroll">Create Your PersonalTA</h2>
        <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "640px", margin: "0 auto" }}>
          <div className="contact-form-column" style={{ background: "rgba(255, 255, 255, 0.06)" }}>
            <h3 className="contact-form-title">Start free during beta</h3>
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
      </section>
    </PersonalTABackdrop>
  );
}
