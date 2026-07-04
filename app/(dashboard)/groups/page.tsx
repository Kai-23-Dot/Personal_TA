"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Plus, LogIn, Loader2, X, Check, Copy, Crown } from "lucide-react";

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
};

function courseName(course: StudyGroup["course"]) {
  if (!course) return null;
  if (Array.isArray(course)) return (course as { name: string }[])[0]?.name ?? null;
  return course.name ?? null;
}

export default function GroupsPage() {
  const router = useRouter();
  const [groups,  setGroups]  = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Copy state per group
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create form
  const [showCreate,  setShowCreate]  = useState(false);
  const [createName,  setCreateName]  = useState("");
  const [createDesc,  setCreateDesc]  = useState("");
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Join form
  const [showJoin,  setShowJoin]  = useState(false);
  const [joinCode,  setJoinCode]  = useState("");
  const [joining,   setJoining]   = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/groups");
    const data = res.ok ? await res.json() : {};
    setGroups(data.groups ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true);
    setCreateError(null);
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: createName.trim(), description: createDesc.trim() || undefined }),
    });
    const data = await res.json();
    if (!res.ok) { setCreateError(data.error ?? "Failed to create group"); setCreating(false); return; }
    setShowCreate(false);
    setCreateName("");
    setCreateDesc("");
    setCreating(false);
    await load();
  }

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

      {/* Header */}
      <section className="mb-6 rounded-3xl border border-sky-400/15 bg-[rgba(12,15,27,0.82)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-100">
              <Users className="h-3.5 w-3.5" /> Collaboration
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white">Study groups</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Collaborate with classmates. Share an invite code to let them join your group.
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setShowJoin(!showJoin); setShowCreate(false); }}
              className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <LogIn className="h-4 w-4" /> Join with code
            </button>
            <button
              onClick={() => { setShowCreate(!showCreate); setShowJoin(false); }}
              className="flex items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-500/15 px-3 py-2 text-sm font-medium text-sky-200 transition hover:bg-sky-500/25"
            >
              <Plus className="h-4 w-4" /> Create group
            </button>
          </div>
        </div>

        {/* Create form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="mt-4 rounded-xl border border-sky-400/20 bg-white/3 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Create a new group</p>
              <button type="button" onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-sky-400/50"
              placeholder="Group name *"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              required
              autoFocus
            />
            <input
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-sky-400/50"
              placeholder="Description (optional)"
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
            />
            {createError && <p className="text-xs text-rose-400">{createError}</p>}
            <button
              type="submit"
              disabled={creating || !createName.trim()}
              className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:opacity-50"
            >
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create group
            </button>
          </form>
        )}

        {/* Join form */}
        {showJoin && (
          <form onSubmit={handleJoin} className="mt-4 rounded-xl border border-sky-400/20 bg-white/3 p-4 space-y-3">
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
      </section>

      {/* Group list */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton-shimmer h-52 rounded-2xl" />
          ))}
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
          {groups.map((group) => (
            <div
              key={group.id}
              onClick={() => router.push(`/groups/${group.id}`)}
              className="group relative cursor-pointer rounded-2xl border border-white/10 bg-[rgba(9,12,24,0.74)] p-5 shadow-[0_8px_40px_rgba(1,6,20,0.35)] transition hover:border-sky-400/25 hover:shadow-[0_12px_48px_rgba(0,0,0,0.4)]"
            >
              {/* Avatar + member count */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-300/25 bg-sky-400/10 text-sm font-semibold text-sky-100 select-none">
                  {group.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex items-center gap-2">
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
              {group.description && (
                <p className="mt-2 text-sm text-slate-400 line-clamp-2">{group.description}</p>
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
