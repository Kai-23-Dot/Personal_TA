"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft, CalendarDays, Check, CheckCircle2, Copy, Crown, Flame,
  Send, Target, Trash2, Users, LogOut,
} from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Progress } from "@/frontend/components/ui/progress";
import { HealthBadge, type HealthLike } from "@/frontend/components/groups/health-badge";
import { CheckinButton } from "@/frontend/components/groups/checkin-button";

type Member = {
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
  profile: { full_name: string | null; avatar_url: string | null } | null;
};

type Message = {
  id: string;
  content: string;
  message_type: string;
  created_at: string;
  user_id: string;
  profile: { full_name: string | null; avatar_url: string | null } | null;
};

type GroupDetail = {
  id: string;
  name: string;
  description: string | null;
  invite_code: string;
  max_members: number;
  course: { id: string; name: string } | null;
  goal: string | null;
  target_end_date: string | null;
  goal_completed_at: string | null;
  progress_pct: number;
};

type Meeting = {
  id: string;
  day_of_week: number;
  start_time: string;
  frequency: "weekly" | "biweekly";
};

type GoalStatus = "no_goal" | "active" | "completed" | "ended_incomplete";

const DAY_LABELS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

function formatSlotTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return format(d, "h:mm a");
}

function untilLabel(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "now";
  const totalHours = Math.floor(diff / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `${days}d ${hours}h`;
  if (totalHours > 0) return `${totalHours}h`;
  return `${Math.max(1, Math.floor(diff / 60_000))}m`;
}

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [group,   setGroup]   = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [myRole,  setMyRole]  = useState<"owner" | "member">("member");
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const [messages,    setMessages]    = useState<Message[]>([]);
  const [msgLoading,  setMsgLoading]  = useState(false);
  const [newMsg,      setNewMsg]      = useState("");
  const [sending,     setSending]     = useState(false);
  const [codeCopied,  setCodeCopied]  = useState(false);

  // Goal-bound signals
  const [meetings,       setMeetings]       = useState<Meeting[]>([]);
  const [health,         setHealth]         = useState<HealthLike>({ state: "unscored" });
  const [goalStatus,     setGoalStatus]     = useState<GoalStatus>("no_goal");
  const [nextMeetingAt,  setNextMeetingAt]  = useState<string | null>(null);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [checkinsToday,  setCheckinsToday]  = useState<string[]>([]);
  const [memberStreaks,  setMemberStreaks]  = useState<Record<string, number>>({});
  const [progressDraft,  setProgressDraft]  = useState(0);
  const [savingProgress, setSavingProgress] = useState(false);
  const [completing,     setCompleting]     = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/groups/${id}`);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to load group");
      setLoading(false);
      return;
    }
    const d = await res.json();
    setGroup(d.group);
    setMembers(d.members ?? []);
    setMyRole(d.myRole ?? "member");
    setMeetings(d.meetings ?? []);
    setHealth(d.health ?? { state: "unscored" });
    setGoalStatus(d.goalStatus ?? "no_goal");
    setNextMeetingAt(d.nextMeetingAt ?? null);
    setCheckedInToday(Boolean(d.checkedInToday));
    setCheckinsToday(d.checkinsToday ?? []);
    setMemberStreaks(d.memberStreaks ?? {});
    setProgressDraft(d.group?.progress_pct ?? 0);
    setLoading(false);
  }, [id]);

  const loadMessages = useCallback(async () => {
    setMsgLoading(true);
    const res = await fetch(`/api/groups/${id}/messages`);
    if (res.ok) {
      const d = await res.json();
      setMessages(d.messages ?? []);
    }
    setMsgLoading(false);
  }, [id]);

  useEffect(() => {
    loadDetail();
    loadMessages();
  }, [loadDetail, loadMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMsg.trim() || sending) return;
    setSending(true);
    const res = await fetch(`/api/groups/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newMsg.trim() }),
    });
    if (res.ok) {
      const d = await res.json();
      setMessages((prev) => [...prev, d.message]);
      setNewMsg("");
    }
    setSending(false);
  }

  async function copyCode() {
    if (!group) return;
    await navigator.clipboard.writeText(group.invite_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  async function handleLeaveOrDelete() {
    const action = myRole === "owner" ? "delete this group" : "leave this group";
    if (!confirm(`Are you sure you want to ${action}? This cannot be undone.`)) return;
    await fetch(`/api/groups/${id}`, { method: "DELETE" });
    router.push("/groups");
  }

  async function saveProgress() {
    setSavingProgress(true);
    const res = await fetch(`/api/groups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progressPct: progressDraft }),
    });
    const d = await res.json().catch(() => null);
    if (res.ok && d?.group) {
      setGroup(d.group);
      setHealth(d.health ?? health);
      setGoalStatus(d.goalStatus ?? goalStatus);
    }
    setSavingProgress(false);
  }

  async function markGoalComplete() {
    if (!confirm("Mark this group's goal as complete? This records the outcome for the group.")) return;
    setCompleting(true);
    const res = await fetch(`/api/groups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markComplete: true }),
    });
    const d = await res.json().catch(() => null);
    if (res.ok && d?.group) {
      setGroup(d.group);
      setHealth(d.health ?? health);
      setGoalStatus(d.goalStatus ?? "completed");
    }
    setCompleting(false);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-6 space-y-4">
        <div className="skeleton-shimmer h-32 rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="skeleton-shimmer h-48 rounded-2xl" />
          <div className="skeleton-shimmer h-48 rounded-2xl" />
        </div>
        <div className="skeleton-shimmer h-64 rounded-2xl" />
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-6 text-center">
        <p className="text-sm text-slate-400 mb-4">{error ?? "Group not found"}</p>
        <button className="btn btn-secondary" onClick={() => router.push("/groups")}>
          ← Back to groups
        </button>
      </div>
    );
  }

  const myUserId = members.find((m) => m.role === myRole)?.user_id ?? "";

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 space-y-5">

      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[rgba(9,12,26,0.84)] px-6 py-6 shadow-[0_20px_80px_rgba(0,0,0,0.3)]">
        <button
          onClick={() => router.push("/groups")}
          className="mb-4 flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to groups
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <HealthBadge health={health} showScore />
              {myRole === "owner" && (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-400/25 px-2 py-0.5 text-xs font-medium text-amber-300">
                  <Crown className="h-3 w-3" /> Owner
                </span>
              )}
              {group.course && (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-400">
                  {group.course.name}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-semibold text-white">{group.name}</h1>
            {group.description && (
              <p className="mt-1 text-sm text-slate-400">{group.description}</p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              {members.length} / {group.max_members} member{group.max_members !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Invite code */}
            <div className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-3 py-2">
              <span className="text-xs text-slate-500">Invite code</span>
              <span className="font-mono text-sm font-semibold tracking-widest text-white">
                {group.invite_code}
              </span>
              <button
                onClick={copyCode}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition hover:bg-white/10"
                title="Copy invite code"
              >
                {codeCopied
                  ? <><Check className="h-3.5 w-3.5 text-emerald-400" /><span className="text-emerald-400">Copied!</span></>
                  : <><Copy className="h-3.5 w-3.5 text-slate-400" /><span className="text-slate-400">Copy</span></>
                }
              </button>
            </div>

            {/* Leave / Delete */}
            <button
              onClick={handleLeaveOrDelete}
              className="flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/8 px-3 py-2 text-xs font-medium text-rose-400 transition hover:bg-rose-500/15"
            >
              {myRole === "owner"
                ? <><Trash2 className="h-3.5 w-3.5" /> Delete group</>
                : <><LogOut className="h-3.5 w-3.5" /> Leave group</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* Goal & Health + Schedule & Check-in — only for goal-bound groups */}
      {group.goal && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Goal & Health */}
          <div className="rounded-2xl border border-white/8 bg-[rgba(9,12,24,0.76)] p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-slate-500" />
                <h2 className="text-sm font-semibold text-white">Goal & health</h2>
              </div>
              <HealthBadge health={health} showScore />
            </div>

            <p className="text-sm text-slate-300">{group.goal}</p>
            {group.target_end_date && (
              <p className="mt-1.5 text-xs text-slate-500">
                Target: {format(new Date(`${group.target_end_date}T00:00:00`), "MMMM d, yyyy")}
                {goalStatus === "ended_incomplete" && (
                  <span className="ml-2 font-medium text-rose-400">Ended without completion</span>
                )}
              </p>
            )}

            {goalStatus === "completed" ? (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <p className="text-sm text-emerald-200">
                  Goal completed
                  {group.goal_completed_at &&
                    ` on ${format(new Date(group.goal_completed_at), "MMMM d, yyyy")}`}
                  . Nice work!
                </p>
              </div>
            ) : (
              <>
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Progress toward goal</span>
                    <span className="font-semibold text-slate-300">{group.progress_pct}%</span>
                  </div>
                  <Progress value={group.progress_pct} className="h-2" />
                </div>

                {health.state === "scored" && (
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {(
                      [
                        ["Attendance", health.components?.attendance ?? 0, 50],
                        ["Streak", health.components?.streak ?? 0, 20],
                        ["Progress", health.components?.progress ?? 0, 30],
                      ] as const
                    ).map(([label, value, max]) => (
                      <div key={label} className="rounded-xl border border-white/8 bg-white/3 px-3 py-2">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
                        <p className="mt-0.5 text-sm font-semibold text-white">
                          {value}<span className="text-xs font-normal text-slate-500">/{max}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {myRole === "owner" && (
                  <div className="mt-4 space-y-3 border-t border-white/6 pt-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={progressDraft}
                        onChange={(e) => setProgressDraft(Number(e.target.value))}
                        className="flex-1 accent-sky-400"
                        aria-label="Goal progress percentage"
                      />
                      <span className="w-10 text-right text-xs font-semibold text-slate-300">{progressDraft}%</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={savingProgress || progressDraft === group.progress_pct}
                        onClick={saveProgress}
                      >
                        {savingProgress ? "Saving…" : "Save"}
                      </Button>
                    </div>
                    <Button size="sm" onClick={markGoalComplete} disabled={completing}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {completing ? "Marking…" : "Mark goal complete"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Schedule & Check-in */}
          <div className="rounded-2xl border border-white/8 bg-[rgba(9,12,24,0.76)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-white">Schedule & check-in</h2>
            </div>

            {meetings.length > 0 ? (
              <ul className="space-y-2">
                {meetings.map((m) => (
                  <li key={m.id} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/3 px-3.5 py-2.5 text-sm">
                    <span className="text-slate-200">
                      {DAY_LABELS[m.day_of_week]} · {formatSlotTime(m.start_time)}
                    </span>
                    <span className="text-xs text-slate-500 capitalize">
                      {m.frequency === "biweekly" ? "Every 2 weeks" : "Weekly"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No recurring meetings set.</p>
            )}

            {nextMeetingAt && goalStatus === "active" && (
              <p className="mt-3 text-xs text-slate-400">
                Next session in <span className="font-semibold text-sky-300">{untilLabel(nextMeetingAt)}</span>
                <span className="text-slate-600"> · {format(new Date(nextMeetingAt), "EEE, MMM d 'at' h:mm a")}</span>
              </p>
            )}

            {goalStatus === "active" && (
              <div className="mt-4 space-y-2">
                <CheckinButton
                  groupId={group.id}
                  checkedIn={checkedInToday}
                  onCheckedIn={({ health: h, streak, userId, checkinsToday: roster }) => {
                    setCheckedInToday(true);
                    setHealth(h as HealthLike);
                    setCheckinsToday(roster);
                    setMemberStreaks((prev) => ({ ...prev, [userId]: streak }));
                  }}
                />
                <p className="text-center text-xs text-slate-500">
                  {checkinsToday.length} of {members.length} member{members.length !== 1 ? "s" : ""} checked in today
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">

        {/* Members */}
        <div className="rounded-2xl border border-white/8 bg-[rgba(9,12,24,0.76)] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-white">Members</h2>
          </div>
          <ul className="space-y-3">
            {members.map((m) => {
              const name = Array.isArray(m.profile)
                ? (m.profile as any)[0]?.full_name
                : m.profile?.full_name;
              return (
                <li key={m.user_id} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-400/15 text-xs font-semibold text-sky-200">
                    {initials(name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{name ?? "Unknown"}</p>
                    <p className="text-xs text-slate-500">
                      Joined {new Date(m.joined_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  {(memberStreaks[m.user_id] ?? 0) > 0 && (
                    <span
                      className="flex shrink-0 items-center gap-0.5 rounded-full border border-orange-400/25 bg-orange-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-orange-300"
                      title={`${memberStreaks[m.user_id]}-day check-in streak`}
                    >
                      <Flame className="h-3 w-3" /> {memberStreaks[m.user_id]}
                    </span>
                  )}
                  {m.role === "owner" && (
                    <Crown className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-label="Owner" />
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Chat */}
        <div className="flex flex-col rounded-2xl border border-white/8 bg-[rgba(9,12,24,0.76)] lg:col-span-2 overflow-hidden" style={{ minHeight: "24rem", maxHeight: "36rem" }}>
          <div className="border-b border-white/6 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-white">Group chat</h2>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {msgLoading ? (
              <p className="text-xs text-slate-500 text-center pt-4">Loading messages…</p>
            ) : messages.length === 0 ? (
              <p className="text-xs text-slate-500 text-center pt-8">
                No messages yet. Say hi to your group!
              </p>
            ) : (
              messages.map((msg) => {
                const name = Array.isArray(msg.profile)
                  ? (msg.profile as any)[0]?.full_name
                  : msg.profile?.full_name;
                const isMe = msg.user_id === myUserId;
                return (
                  <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-400/15 text-xs font-semibold text-sky-200">
                      {initials(name)}
                    </div>
                    <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-1`}>
                      {!isMe && (
                        <p className="text-xs text-slate-500">{name ?? "Unknown"}</p>
                      )}
                      <div className={`rounded-2xl px-3 py-2 text-sm ${
                        isMe
                          ? "rounded-tr-sm bg-sky-500/20 text-sky-100"
                          : "rounded-tl-sm bg-white/6 text-slate-200"
                      }`}>
                        {msg.content}
                      </div>
                      <p className="text-[10px] text-slate-600">{timeAgo(msg.created_at)}</p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={sendMessage} className="border-t border-white/6 px-4 py-3 flex gap-2">
            <input
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
              placeholder="Send a message…"
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-sky-400/40"
              maxLength={500}
            />
            <button
              type="submit"
              disabled={!newMsg.trim() || sending}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white transition hover:bg-sky-400 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
