"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Users, Plus, LogIn, Loader2, X, Check, Copy, Crown, Target } from "lucide-react";
import { cn } from "@/backend/utils";
import { PageHero } from "@/frontend/components/ui/page-hero";
import { Button } from "@/frontend/components/ui/button";
import { Progress } from "@/frontend/components/ui/progress";
import { CreateGroupForm } from "@/frontend/components/groups/create-group-form";
import { HealthBadge, type HealthLike } from "@/frontend/components/groups/health-badge";
import { CheckinButton } from "@/frontend/components/groups/checkin-button";

type GoalStatus = "no_goal" | "active" | "completed" | "ended_incomplete";

type StudyGroup = {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  max_members: number;
  created_at: string;
  member_count: number;
  my_role: "owner" | "member";
  course: { name: string } | null;
  course_id: string | null;
  goal: string | null;
  target_end_date: string | null;
  goal_completed_at: string | null;
  progress_pct: number;
  health: HealthLike;
  goal_status: GoalStatus;
  next_meeting_at: string | null;
  checked_in_today: boolean;
};

function courseName(course: StudyGroup["course"]) {
  if (!course) return null;
  if (Array.isArray(course)) return (course as { name: string }[])[0]?.name ?? null;
  return course.name ?? null;
}

/** "23 days left" / "Ends tomorrow" / "Ends today" / "Ended Mar 4". */
function goalCountdown(group: StudyGroup): { label: string; ended: boolean } | null {
  if (!group.target_end_date || group.goal_status === "completed") return null;
  const end = new Date(`${group.target_end_date}T00:00:00Z`);
  const today = new Date();
  const days = Math.ceil(
    (end.getTime() - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86_400_000
  );
  if (days < 0) return { label: `Ended ${format(end, "MMM d")}`, ended: true };
  if (days === 0) return { label: "Ends today", ended: false };
  if (days === 1) return { label: "Ends tomorrow", ended: false };
  return { label: `${days} days left`, ended: false };
}

const STATUS_FILTERS: { value: "all" | GoalStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "ended_incomplete", label: "Ended" },
  { value: "no_goal", label: "No goal" },
];

const HEALTH_FILTERS = [
  { value: "all", label: "Any health" },
  { value: "thriving", label: "Thriving" },
  { value: "steady", label: "Steady" },
  { value: "at-risk", label: "At risk" },
  { value: "critical", label: "Critical" },
  { value: "new", label: "New" },
] as const;

function healthKey(h: HealthLike): string {
  return h.state === "scored" ? h.tier : h.state;
}

export default function GroupsPage() {
  const router = useRouter();
  const [groups,  setGroups]  = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Copy state per group
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);

  // Join form
  const [showJoin,  setShowJoin]  = useState(false);
  const [joinCode,  setJoinCode]  = useState("");
  const [joining,   setJoining]   = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null);

  // Browse filters (client-side — the endpoint only returns the user's groups)
  const [courseFilter, setCourseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | GoalStatus>("all");
  const [healthFilter, setHealthFilter] = useState<(typeof HEALTH_FILTERS)[number]["value"]>("all");

  const courseOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const g of groups) {
      const name = courseName(g.course);
      if (g.course_id && name) seen.set(g.course_id, name);
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [groups]);

  const filteredGroups = useMemo(
    () =>
      groups.filter(
        (g) =>
          (courseFilter === "all" || g.course_id === courseFilter) &&
          (statusFilter === "all" || g.goal_status === statusFilter) &&
          (healthFilter === "all" || healthKey(g.health) === healthFilter)
      ),
    [groups, courseFilter, statusFilter, healthFilter]
  );

  const filtersActive = courseFilter !== "all" || statusFilter !== "all" || healthFilter !== "all";

  function applyCheckinResult(groupId: string, health: unknown) {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, checked_in_today: true, health: health as HealthLike } : g
      )
    );
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/groups");
      const data = res.ok ? await res.json() : {};
      setGroups(data.groups ?? []);
    } catch {
      // Leave groups empty and fall through to the empty state instead of hanging on the skeleton.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError(null);
    setJoinSuccess(null);
    const res = await fetch("/api/groups/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode: joinCode.trim().toUpperCase() }),
    });
    const data = await res.json();
    if (!res.ok) { setJoinError(data.error ?? "Failed to join group"); setJoining(false); return; }
    setJoinSuccess(data.alreadyMember ? "You're already a member!" : `Joined "${data.group?.name}"!`);
    setJoinCode("");
    setJoining(false);
    await load();
    setTimeout(() => { setShowJoin(false); setJoinSuccess(null); }, 1800);
  }

  async function handleLeaveOrDelete(group: StudyGroup, e: React.MouseEvent) {
    e.stopPropagation();
    const action = group.my_role === "owner" ? "delete this group and remove all members" : "leave this group";
    if (!confirm(`Are you sure you want to ${action}?`)) return;
    await fetch(`/api/groups/${group.id}`, { method: "DELETE" });
    await load();
  }

  async function copyCode(group: StudyGroup, e: React.MouseEvent) {
    e.stopPropagation();
    await navigator.clipboard.writeText(group.invite_code);
    setCopiedId(group.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6">

      <PageHero
        className="mb-6"
        icon={Users}
        badgeLabel="Collaboration"
        title="Study groups"
        description="Collaborate with classmates. Share an invite code to let them join your group."
        action={
          <>
            <Button
              variant="secondary"
              onClick={() => { setShowJoin(!showJoin); setShowCreate(false); }}
            >
              <LogIn className="h-4 w-4" /> Join with code
            </Button>
            <Button
              onClick={() => { setShowCreate(!showCreate); setShowJoin(false); }}
            >
              <Plus className="h-4 w-4" /> Create group
            </Button>
          </>
        }
      />

      {/* Create form — goal, target date, and ≥1 meeting slot are required */}
      {showCreate && <CreateGroupForm onCreated={load} onClose={() => setShowCreate(false)} />}

      {/* Join form */}
      {showJoin && (
        <form onSubmit={handleJoin} className="mt-4 mb-6 rounded-xl border border-sky-400/20 bg-white/3 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Join with invite code</p>
            <button type="button" onClick={() => { setShowJoin(false); setJoinError(null); setJoinSuccess(null); }} className="text-slate-500 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white placeholder-slate-500 outline-none focus:border-sky-400/50 uppercase tracking-widest"
            placeholder="e.g. AB12CD34"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
            maxLength={8}
            required
            autoFocus
          />
          {joinError   && <p className="text-xs text-rose-400">{joinError}</p>}
          {joinSuccess && <p className="text-xs text-emerald-400">{joinSuccess}</p>}
          <button
            type="submit"
            disabled={joining || joinCode.length < 4}
            className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:opacity-50"
          >
            {joining && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Join group
          </button>
        </form>
      )}

      {/* Filter row */}
      {!loading && groups.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150",
                  statusFilter === f.value
                    ? "border-sky-300/50 bg-sky-400/15 text-sky-100"
                    : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="hidden h-4 w-px bg-white/10 sm:block" />
          <div className="flex flex-wrap gap-1.5">
            {HEALTH_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setHealthFilter(f.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150",
                  healthFilter === f.value
                    ? "border-sky-300/50 bg-sky-400/15 text-sky-100"
                    : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {courseOptions.length > 0 && (
            <select
              aria-label="Filter by course"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="ml-auto h-8 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-slate-300 outline-none transition-colors duration-150 hover:bg-white/10"
            >
              <option value="all">All courses</option>
              {courseOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Group list */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton-shimmer h-64 rounded-2xl" />
          ))}
        </div>
      ) : groups.length > 0 && filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Target className="h-8 w-8 text-slate-600" />
          <p className="text-sm text-slate-400">No groups match these filters.</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setCourseFilter("all"); setStatusFilter("all"); setHealthFilter("all"); }}
          >
            Clear filters
          </Button>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <Users className="h-6 w-6 text-slate-500" />
          </div>
          <p className="text-base font-medium text-white">No study groups yet</p>
          <p className="max-w-xs text-sm text-slate-500">
            Create a group to collaborate with classmates, or join one using an invite code.
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-500/15 px-4 py-2 text-sm font-medium text-sky-200 hover:bg-sky-500/25"
            >
              <Plus className="h-4 w-4" /> Create group
            </button>
            <button
              onClick={() => setShowJoin(true)}
              className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
            >
              <LogIn className="h-4 w-4" /> Join with code
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredGroups.map((group) => (
            <div
              key={group.id}
              onClick={() => router.push(`/groups/${group.id}`)}
              className="group relative cursor-pointer rounded-2xl border border-white/10 bg-[rgba(9,12,24,0.74)] p-5 shadow-[0_8px_40px_rgba(1,6,20,0.35)] transition hover:border-sky-400/25 hover:shadow-[0_12px_48px_rgba(0,0,0,0.4)]"
            >
              {/* Avatar + health + member count */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-300/25 bg-sky-400/10 text-sm font-semibold text-sky-100 select-none">
                  {group.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <HealthBadge health={group.health} />
                  {group.my_role === "owner" && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-400/20 px-2 py-0.5 text-xs text-amber-300">
                      <Crown className="h-2.5 w-2.5" /> Owner
                    </span>
                  )}
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
                    {group.member_count}/{group.max_members}
                  </span>
                </div>
              </div>

              <h2 className="mt-4 text-lg font-semibold text-white">{group.name}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {courseName(group.course) ?? "No course linked"}
              </p>

              {/* Goal + countdown + progress */}
              {group.goal ? (
                <div className="mt-2 space-y-2">
                  <p className="flex items-center gap-1.5 text-sm text-slate-400 line-clamp-1">
                    <Target className="h-3.5 w-3.5 shrink-0 text-sky-400/70" />
                    <span className="truncate">{group.goal}</span>
                  </p>
                  {(() => {
                    const countdown = goalCountdown(group);
                    return countdown ? (
                      <p className={cn("text-xs font-medium", countdown.ended ? "text-rose-400" : "text-slate-500")}>
                        {countdown.label}
                      </p>
                    ) : null;
                  })()}
                  {group.goal_status !== "completed" && (
                    <Progress value={group.progress_pct} className="h-1.5" />
                  )}
                </div>
              ) : (
                group.description && (
                  <p className="mt-2 text-sm text-slate-400 line-clamp-2">{group.description}</p>
                )
              )}

              {/* Check-in — one tap, feeds the health signal */}
              {group.goal_status === "active" && (
                <div className="mt-3">
                  <CheckinButton
                    groupId={group.id}
                    checkedIn={group.checked_in_today}
                    size="sm"
                    onCheckedIn={({ health }) => applyCheckinResult(group.id, health)}
                  />
                </div>
              )}

              {/* Invite code row */}
              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
                  <span className="text-[10px] text-slate-600 uppercase tracking-wider">Code</span>
                  <span className="font-mono text-xs font-semibold tracking-widest text-slate-200">
                    {group.invite_code}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {/* Copy invite code */}
                  <button
                    onClick={(e) => copyCode(group, e)}
                    title="Copy invite code"
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition hover:bg-white/8"
                  >
                    {copiedId === group.id
                      ? <><Check className="h-3.5 w-3.5 text-emerald-400" /><span className="text-emerald-400">Copied</span></>
                      : <><Copy className="h-3.5 w-3.5 text-slate-500" /><span className="text-slate-500">Copy</span></>
                    }
                  </button>

                  {/* Leave / Delete */}
                  <button
                    onClick={(e) => handleLeaveOrDelete(group, e)}
                    className="rounded-lg px-2.5 py-1.5 text-xs text-slate-600 opacity-0 transition hover:bg-rose-500/15 hover:text-rose-400 group-hover:opacity-100"
                  >
                    {group.my_role === "owner" ? "Delete" : "Leave"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
