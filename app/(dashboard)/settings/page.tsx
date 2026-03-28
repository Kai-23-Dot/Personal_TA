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

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [domain, setDomain] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const [profileRes, connectionsRes] = await Promise.all([
        fetch("/api/profile"),
        fetch("/api/lms/connections"),
      ]);
      const profileData = profileRes.ok ? await profileRes.json() : null;
      const connectionsData = connectionsRes.ok ? await connectionsRes.json() : [];
      if (mounted) {
        setProfile(profileData ?? null);
        setConnections(connectionsData ?? []);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

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

  async function handleDisconnect(platform: string) {
    const res = await fetch(`/api/lms/connections?platform=${platform}`, { method: "DELETE" });
    if (res.ok) {
      setConnections((prev) => prev.filter((c) => c.platform !== platform));
    }
  }

  return (
    <section className="section">
      <h2 className="animate-on-scroll">Settings</h2>

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
              {savingProfile ? "Saving..." : "Save Profile"}
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
          <h3 className="contact-form-title">LMS Connections</h3>
          <div className="contact-form" style={{ gap: "1rem" }}>
            <div>
              <strong>Connected platforms</strong>
              <ul style={{ marginTop: "0.6rem", color: "var(--light)" }}>
                {connections.length === 0 ? <li>No connections yet.</li> : null}
                {connections.map((conn) => (
                  <li key={conn.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                    <span>
                      {conn.platform.replace("_", " ")} {conn.canvas_domain ? `(${conn.canvas_domain})` : ""}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleDisconnect(conn.platform)}
                    >
                      Disconnect
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="form-field">
              <label htmlFor="canvasDomain">Canvas domain (OAuth)</label>
              <input
                id="canvasDomain"
                type="text"
                placeholder="school.instructure.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
                <a className="btn btn-primary" href={domain ? `/api/lms/canvas?domain=${encodeURIComponent(domain)}` : "#"}>
                  Connect Canvas (OAuth)
                </a>
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
      </div>
    </section>
  );
}
