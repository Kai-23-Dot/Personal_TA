"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [domain, setDomain] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setMessageType(null);

    try {
      const res = await fetch("/api/lms/canvas/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, access_token: token }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        setMessage(data?.error || "Connection failed.");
        setMessageType("error");
        return;
      }
      setMessage("Canvas connected successfully. You can sync from the dashboard.");
      setMessageType("success");
    } catch (err) {
      setMessage((err as Error).message);
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section">
      <h2 className="animate-on-scroll">Settings</h2>
      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "800px", margin: "0 auto" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Connect Canvas</h3>
          <form className="contact-form" onSubmit={handleConnect}>
            <div className="form-field">
              <label htmlFor="domain">Canvas domain</label>
              <input
                id="domain"
                type="text"
                placeholder="school.instructure.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="token">Personal Access Token</label>
              <input
                id="token"
                type="password"
                placeholder="Paste your Canvas token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="contact-submit-btn" disabled={loading}>
              {loading ? "Connecting..." : "Connect Canvas"}
            </button>
            {message ? (
              <div className={`form-message ${messageType ?? "success"}`} style={{ display: "block" }}>
                {message}
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  );
}
