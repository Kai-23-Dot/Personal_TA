"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Check, Copy, Crown, Send, Trash2, Users, LogOut,
} from "lucide-react";

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
};

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

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-6 space-y-4">
        <div className="skeleton-shimmer h-32 rounded-2xl" />
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
            <div className="flex items-center gap-2 mb-1">
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
