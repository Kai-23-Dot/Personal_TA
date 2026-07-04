"use client";

import { useEffect, useState } from "react";

type Profile = {
  full_name: string | null;
  school_name: string | null;
  grade_level: number | null;
  timezone: string | null;
  preferred_subjects: string[] | null;
  role: "student" | "teacher" | null;
  email?: string | null;
};

type Connection = {
  id: string;
  platform: string;
  canvas_domain: string | null;
  last_synced_at: string | null;
  is_active: boolean;
};

type BillingStatus = {
  plan: "free" | "pro";
  limits: { practiceTestsPerWeek: number; notesPerWeek: number; tokensPerDay: number } | null;
  usage: { practiceTests: number; notes: number; tokens: number };
};

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
];

function platformLabel(conn: Connection) {
  const base = conn.platform.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return conn.canvas_domain ? `${base} — ${conn.canvas_domain}` : base;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [domain, setDomain] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const [profileRes, connectionsRes, billingRes] = await Promise.all([
        fetch("/api/profile"),
        fetch("/api/lms/connections"),
        fetch("/api/billing/status"),
      ]);
      const profileData = profileRes.ok ? await profileRes.json() : null;
      const connectionsData = connectionsRes.ok ? await connectionsRes.json() : [];
      const billingData = billingRes.ok ? await billingRes.json() : null;
      if (mounted) {
        setProfile(profileData ?? null);
        setConnections(connectionsData ?? []);
        setBilling(billingData ?? null);
      }
    }
    load();

    // Surface the outcome of a returning Checkout redirect.
    if (typeof window !== "undefined") {
      const checkout = new URLSearchParams(window.location.search).get("checkout");
      if (checkout === "success") {
        setMessage("Subscription active — welcome to Pro! It may take a moment to reflect.");
        setMessageType("success");
      }
    }
    return () => {
      mounted = false;
    };
  }, []);

  async function handleBillingAction(endpoint: "checkout" | "portal") {
    setBillingBusy(true);
    try {
      const res = await fetch(`/api/billing/${endpoint}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        setMessage(data?.error || "Could not open billing. Please try again.");
        setMessageType("error");
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      setMessage((err as Error).message);
      setMessageType("error");
    } finally {
      setBillingBusy(false);
    }
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSavingProfile(true);
    setMessage(null);
    setMessageType(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          preferred_subjects: (profile.preferred_subjects ?? []).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error || "Profile update failed.");
        setMessageType("error");
        return;
      }
      setProfile(data?.profile ?? profile);
      setMessage("Profile updated.");
      setMessageType("success");
    } catch (err) {
      setMessage((err as Error).message);
      setMessageType("error");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleDisconnect(id: string) {
    const res = await fetch(`/api/lms/connections?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setConnections((prev) => prev.filter((c) => c.id !== id));
    }
  }

  const canvasConnections = connections.filter((c) => c.platform === "canvas");
  const otherConnections = connections.filter((c) => c.platform !== "canvas");

  return (
    <section className="section">
      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Profile</h3>
          <form className="contact-form" onSubmit={handleProfileSave}>
            <div className="form-field">
              <label htmlFor="fullName">Full name</label>
              <input
                id="fullName"
                type="text"
                value={profile?.full_name ?? ""}
                onChange={(e) => setProfile((prev) => ({ ...prev!, full_name: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label htmlFor="schoolName">School</label>
              <input
                id="schoolName"
                type="text"
                value={profile?.school_name ?? ""}
                onChange={(e) => setProfile((prev) => ({ ...prev!, school_name: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label htmlFor="gradeLevel">Grade level</label>
              <input
                id="gradeLevel"
                type="number"
                min={6}
                max={12}
                value={profile?.grade_level ?? ""}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev!,
                    grade_level: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </div>
            <div className="form-field">
              <label htmlFor="timezone">Time zone</label>
              <select
                id="timezone"
                value={profile?.timezone ?? "America/New_York"}
                onChange={(e) => setProfile((prev) => ({ ...prev!, timezone: e.target.value }))}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="subjects">Preferred subjects (comma separated)</label>
              <input
                id="subjects"
                type="text"
                value={(profile?.preferred_subjects ?? []).join(", ")}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev!,
                    preferred_subjects: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </div>
            <div className="form-field">
              <label htmlFor="role">Role</label>
              <select
                id="role"
                value={profile?.role ?? "student"}
                onChange={(e) => setProfile((prev) => ({ ...prev!, role: e.target.value as "student" | "teacher" }))}
              >
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select>
            </div>
            <button type="submit" className="contact-submit-btn" disabled={savingProfile}>
              {savingProfile ? "Saving..." : "Save profile"}
            </button>
            {message ? (
              <div className={`form-message ${messageType ?? "success"}`} style={{ display: "block" }}>
                {message}
              </div>
            ) : null}
          </form>
        </div>
      </div>

      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "2rem auto 0" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Billing</h3>
          <div className="contact-form" style={{ gap: "1rem" }}>
            {billing ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1rem",
                    padding: "0.75rem 0.9rem",
                    borderRadius: "10px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div>
                    <span style={{ color: "var(--light)", fontWeight: 600 }}>
                      {billing.plan === "pro" ? "Pro plan" : "Free plan"}
                    </span>
                    <span style={{ color: "var(--gray)", fontSize: "0.8rem", marginLeft: "0.6rem" }}>
                      {billing.plan === "pro" ? "Unlimited access" : "$20/mo for unlimited"}
                    </span>
                  </div>
                  {billing.plan === "pro" ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: "0.85rem", padding: "0.4rem 0.9rem" }}
                      disabled={billingBusy}
                      onClick={() => handleBillingAction("portal")}
                    >
                      Manage subscription
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ fontSize: "0.85rem", padding: "0.4rem 0.9rem" }}
                      disabled={billingBusy}
                      onClick={() => handleBillingAction("checkout")}
                    >
                      Upgrade to Pro
                    </button>
                  )}
                </div>

                {billing.limits ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.4rem" }}>
                    <li style={{ color: "var(--gray)", fontSize: "0.85rem" }}>
                      Practice tests this week: {billing.usage.practiceTests} / {billing.limits.practiceTestsPerWeek}
                    </li>
                    <li style={{ color: "var(--gray)", fontSize: "0.85rem" }}>
                      Notes this week: {billing.usage.notes} / {billing.limits.notesPerWeek}
                    </li>
                    <li style={{ color: "var(--gray)", fontSize: "0.85rem" }}>
                      AI tokens today: {billing.usage.tokens.toLocaleString()} / {billing.limits.tokensPerDay.toLocaleString()}
                    </li>
                  </ul>
                ) : (
                  <p style={{ color: "var(--gray)", margin: 0, fontSize: "0.85rem" }}>
                    You have unlimited practice tests, notes, and AI usage.
                  </p>
                )}
                <a className="btn btn-secondary" href="/pricing" style={{ alignSelf: "flex-start", fontSize: "0.85rem", padding: "0.4rem 0.9rem" }}>
                  View plans
                </a>
              </>
            ) : (
              <p style={{ color: "var(--gray)", margin: 0 }}>Loading billing…</p>
            )}
          </div>
        </div>
      </div>

      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "2rem auto 0" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Canvas Accounts</h3>
          <div className="contact-form" style={{ gap: "1.25rem" }}>

            {/* List existing Canvas connections */}
            {canvasConnections.length > 0 ? (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
                {canvasConnections.map((conn) => (
                  <li
                    key={conn.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "1rem",
                      padding: "0.65rem 0.9rem",
                      borderRadius: "10px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div>
                      <span style={{ color: "var(--light)", fontWeight: 500 }}>
                        {conn.canvas_domain ?? "Canvas"}
                      </span>
                      {conn.last_synced_at ? (
                        <span style={{ color: "var(--gray)", fontSize: "0.78rem", marginLeft: "0.6rem" }}>
                          Last sync {new Date(conn.last_synced_at).toLocaleString()}
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: "0.8rem", padding: "0.35rem 0.8rem" }}
                      onClick={() => handleDisconnect(conn.id)}
                    >
                      Disconnect
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: "var(--gray)", margin: 0 }}>No Canvas accounts connected.</p>
            )}

            {/* Add another Canvas account */}
            <div className="form-field" style={{ marginTop: "0.25rem" }}>
              <label htmlFor="canvasDomain">
                {canvasConnections.length > 0 ? "Add another Canvas account" : "Connect Canvas"}
              </label>
              <input
                id="canvasDomain"
                type="text"
                placeholder="school.instructure.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
                <a
                  className="btn btn-primary"
                  href={domain.trim() ? `/api/lms/canvas?domain=${encodeURIComponent(domain.trim())}` : "#"}
                >
                  Connect via OAuth
                </a>
                <a className="btn btn-secondary" href="/settings/setup/canvas">
                  Use access token
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Other LMS platforms */}
      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "2rem auto 0" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Other Connections</h3>
          <div className="contact-form" style={{ gap: "1rem" }}>
            {otherConnections.length > 0 ? (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
                {otherConnections.map((conn) => (
                  <li
                    key={conn.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "1rem",
                      padding: "0.65rem 0.9rem",
                      borderRadius: "10px",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <span style={{ color: "var(--light)", fontWeight: 500 }}>
                      {platformLabel(conn)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: "0.8rem", padding: "0.35rem 0.8rem" }}
                      onClick={() => handleDisconnect(conn.id)}
                    >
                      Disconnect
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: "var(--gray)", margin: 0 }}>No other platforms connected.</p>
            )}

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <a className="btn btn-secondary" href="/api/lms/google">
                Connect Google Classroom
              </a>
              <a className="btn btn-secondary" href="/api/lms/microsoft">
                Connect Microsoft Teams
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
