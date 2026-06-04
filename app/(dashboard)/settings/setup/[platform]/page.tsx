"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function SetupPlatformPage() {
  const router = useRouter();
  const params = useParams<{ platform: string }>();
  const platform = params?.platform ?? "";
  const platformLabel = useMemo(
    () => platform.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
    [platform]
  );

  const [domain, setDomain] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isCanvas = platform === "canvas";

  async function connectCanvasWithToken() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/lms/canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, access_token: token }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        setMessage(data?.error || "Failed to connect Canvas");
        return;
      }

      // Trigger initial sync for this connection.
      if (data?.connectionId) {
        await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId: data.connectionId }),
        });
      }

      router.push("/settings?connected=canvas");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to connect Canvas");
    } finally {
      setLoading(false);
    }
  }

  function startCanvasOAuth() {
    if (!domain.trim()) {
      setMessage("Enter your Canvas domain first (e.g. school.instructure.com)");
      return;
    }
    window.location.href = `/api/lms/canvas?domain=${encodeURIComponent(domain.trim())}`;
  }

  return (
    <section className="section">
      <h2 className="animate-on-scroll">Connect {platformLabel}</h2>
      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "780px", margin: "0 auto" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Bring your classes into PersonalTA</h3>

          {!isCanvas ? (
            <p style={{ color: "var(--gray)" }}>
              Setup for {platformLabel} is currently handled via the Settings page.
            </p>
          ) : (
            <div className="contact-form" style={{ display: "grid", gap: "1rem" }}>
              <div className="form-field">
                <label htmlFor="schoolDomain">Canvas domain</label>
                <input
                  id="schoolDomain"
                  type="text"
                  placeholder="school.instructure.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label htmlFor="canvasToken">Paste Canvas access token (recommended)</label>
                <input
                  id="canvasToken"
                  type="password"
                  placeholder="Canvas API token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="contact-submit-btn"
                  onClick={connectCanvasWithToken}
                  disabled={loading || !domain.trim() || !token.trim()}
                >
                  {loading ? "Connecting..." : "Connect with token"}
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={startCanvasOAuth}
                  disabled={loading || !domain.trim()}
                >
                  Connect with OAuth
                </button>
              </div>

              <p style={{ color: "var(--gray)", marginTop: "0.25rem" }}>
                Token flow: Canvas Account → Settings → Approved Integrations / New Access Token.
              </p>

              {message ? (
                <div className="form-message" style={{ display: "block" }}>
                  {message}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
