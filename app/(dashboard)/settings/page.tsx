"use client";

import { useEffect, useState } from "react";
import { cn } from "@/backend/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/frontend/components/ui/select";
import { Badge } from "@/frontend/components/ui/badge";

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
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your profile, billing, and connected platforms.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleProfileSave}>
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                type="text"
                value={profile?.full_name ?? ""}
                onChange={(e) => setProfile((prev) => ({ ...prev!, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schoolName">School</Label>
              <Input
                id="schoolName"
                type="text"
                value={profile?.school_name ?? ""}
                onChange={(e) => setProfile((prev) => ({ ...prev!, school_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gradeLevel">Grade level</Label>
              <Input
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
            <div className="space-y-1.5">
              <Label htmlFor="timezone">Time zone</Label>
              <Select
                value={profile?.timezone ?? "America/New_York"}
                onValueChange={(value) => setProfile((prev) => ({ ...prev!, timezone: value }))}
              >
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subjects">Preferred subjects (comma separated)</Label>
              <Input
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
            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <Select
                value={profile?.role ?? "student"}
                onValueChange={(value) =>
                  setProfile((prev) => ({ ...prev!, role: value as "student" | "teacher" }))
                }
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? "Saving..." : "Save profile"}
              </Button>
              {message ? (
                <p className={cn("text-sm", messageType === "error" ? "text-rose-400" : "text-emerald-400")}>
                  {message}
                </p>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
        </CardHeader>
        <CardContent>
          {billing ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-semibold text-foreground">
                    {billing.plan === "pro" ? "Pro plan" : "Free plan"}
                  </span>
                  <Badge variant={billing.plan === "pro" ? "info" : "outline"}>
                    {billing.plan === "pro" ? "Unlimited access" : "$20/mo for unlimited"}
                  </Badge>
                </div>
                {billing.plan === "pro" ? (
                  <Button variant="secondary" size="sm" disabled={billingBusy} onClick={() => handleBillingAction("portal")}>
                    Manage subscription
                  </Button>
                ) : (
                  <Button size="sm" disabled={billingBusy} onClick={() => handleBillingAction("checkout")}>
                    Upgrade to Pro
                  </Button>
                )}
              </div>

              {billing.limits ? (
                <ul className="grid gap-1.5">
                  <li className="text-sm text-muted-foreground">
                    Practice tests this week: {billing.usage.practiceTests} / {billing.limits.practiceTestsPerWeek}
                  </li>
                  <li className="text-sm text-muted-foreground">
                    Notes this week: {billing.usage.notes} / {billing.limits.notesPerWeek}
                  </li>
                  <li className="text-sm text-muted-foreground">
                    AI tokens today: {billing.usage.tokens.toLocaleString()} / {billing.limits.tokensPerDay.toLocaleString()}
                  </li>
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  You have unlimited practice tests, notes, and AI usage.
                </p>
              )}
              <Button variant="secondary" size="sm" asChild>
                <a href="/pricing">View plans</a>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading billing…</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Canvas accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {canvasConnections.length > 0 ? (
            <ul className="grid gap-2">
              {canvasConnections.map((conn) => (
                <li
                  key={conn.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"
                >
                  <div>
                    <span className="text-sm font-medium text-foreground">{conn.canvas_domain ?? "Canvas"}</span>
                    {conn.last_synced_at ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        Last sync {new Date(conn.last_synced_at).toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => handleDisconnect(conn.id)}>
                    Disconnect
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No Canvas accounts connected.</p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="canvasDomain">
              {canvasConnections.length > 0 ? "Add another Canvas account" : "Connect Canvas"}
            </Label>
            <Input
              id="canvasDomain"
              type="text"
              placeholder="school.instructure.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
            <div className="flex gap-3 pt-1.5">
              <Button asChild>
                <a href={domain.trim() ? `/api/lms/canvas?domain=${encodeURIComponent(domain.trim())}` : "#"}>
                  Connect via OAuth
                </a>
              </Button>
              <Button variant="secondary" asChild>
                <a href="/settings/setup/canvas">Use access token</a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Other connections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {otherConnections.length > 0 ? (
            <ul className="grid gap-2">
              {otherConnections.map((conn) => (
                <li
                  key={conn.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"
                >
                  <span className="text-sm font-medium text-foreground">{platformLabel(conn)}</span>
                  <Button variant="secondary" size="sm" onClick={() => handleDisconnect(conn.id)}>
                    Disconnect
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No other platforms connected.</p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" asChild>
              <a href="/api/lms/google">Connect Google Classroom</a>
            </Button>
            <Button variant="secondary" asChild>
              <a href="/api/lms/microsoft">Connect Microsoft Teams</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
