"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  AlertTriangle, BookOpen, Brain, Calendar, ChevronRight,
  Clock, Flame, Zap,
} from "lucide-react";
import { PageHero } from "@/frontend/components/ui/page-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";

// ── Types ──────────────────────────────────────────────────────────────────

type PriorityItem = {
  id: string;
  title: string;
  assignment_type: string;
  due_date: string | null;
  course_name?: string;
  priority_score: number;
  smart_reminder: string | null;
  recommended_start: string | null;
  final_estimated_minutes: number;
};

type StudyBlock = {
  day: string;
  subject: string;
  task: string;
  durationMinutes: number;
  assignmentId: string;
  priority: "high" | "medium" | "low";
};

type HeatmapCell = {
  week: string;
  courseId: string;
  courseName: string;
  courseColor: string | null;
  count: number;
  estimatedMinutes: number;
  hasHighStakes: boolean;
};

type GradeImpactItem = {
  id: string;
  title: string;
  assignment_type: string;
  due_date: string | null;
  daysLeft: number;
  courseName: string;
  courseColor: string | null;
  impactPct: number;
  isHighStakes: boolean;
};

type DangerZone = { label: string; assignments: string[] };

type Availability = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  preferred_block_minutes: number;
};

type PlannerBlock = {
  id: string;
  title: string;
  task_type: string;
  start_time: string;
  end_time: string;
  status: string;
};

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Helpers ────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 75) return "text-rose-400";
  if (score >= 50) return "text-orange-400";
  if (score >= 25) return "text-amber-300";
  return "text-emerald-400";
}

function scoreBg(score: number) {
  if (score >= 75) return "bg-rose-500/15 border-rose-400/25";
  if (score >= 50) return "bg-orange-500/15 border-orange-400/25";
  if (score >= 25) return "bg-amber-400/10 border-amber-400/20";
  return "bg-emerald-500/10 border-emerald-400/20";
}

function priorityBadge(p: "high" | "medium" | "low") {
  const map = {
    high:   "bg-rose-500/20 text-rose-300 border-rose-400/30",
    medium: "bg-amber-400/15 text-amber-300 border-amber-400/25",
    low:    "bg-slate-500/15 text-slate-400 border-slate-500/25",
  };
  return map[p];
}

function fmtMins(m: number) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── SectionCard ─────────────────────────────────────────────────────────────

function SectionCard({ title, subtitle, children, className = "" }: {
  title: string; subtitle?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-white/8 bg-[rgba(9,12,24,0.76)] p-5 shadow-[0_8px_40px_rgba(0,0,0,0.3)] backdrop-blur ${className}`}>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function StudyPage() {
  const [priorities, setPriorities] = useState<PriorityItem[]>([]);
  const [schedule, setSchedule] = useState<StudyBlock[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [gradeItems, setGradeItems] = useState<GradeImpactItem[]>([]);
  const [dangerZones, setDangerZones] = useState<DangerZone[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Weekly planner state (merged from the former standalone Planner tab) ──
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [blocks, setBlocks] = useState<PlannerBlock[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [autoAdjusted, setAutoAdjusted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const [pri, sch, heat, grade] = await Promise.all([
          fetch("/api/study/priorities").then((r) => (r.ok ? r.json() : {}) as Promise<any>),
          fetch("/api/study/schedule").then((r) => (r.ok ? r.json() : {}) as Promise<any>),
          fetch("/api/study/heatmap").then((r) => (r.ok ? r.json() : {}) as Promise<any>),
          fetch("/api/study/grade-impact").then((r) => (r.ok ? r.json() : {}) as Promise<any>),
        ]);
        setPriorities(pri.items ?? []);
        setSchedule(sch.schedule ?? []);
        setHeatmap(heat.cells ?? []);
        setGradeItems(grade.items ?? []);
        setDangerZones(grade.dangerZones ?? []);
      } catch {
        // Leave lists empty and fall through to the empty state instead of hanging on the skeleton.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadPlan() {
      const [availabilityRes, planRes] = await Promise.all([
        fetch("/api/study/availability"),
        fetch(`/api/planner/plan?date=${date}`),
      ]);
      const availabilityData = availabilityRes.ok ? await availabilityRes.json() : [];
      const planData = planRes.ok ? await planRes.json() : { blocks: [] };
      if (mounted) {
        setAvailability(availabilityData ?? []);
        setBlocks(planData?.blocks ?? []);
      }
    }
    loadPlan();
    return () => { mounted = false; };
  }, [date]);

  useEffect(() => {
    if (blocks.length === 0) return;
    blocks.forEach((block) => {
      if (autoAdjusted[block.id]) return;
      if (new Date(block.end_time) < new Date() && block.status === "scheduled") {
        setAutoAdjusted((prev) => ({ ...prev, [block.id]: true }));
        updateBlock(block.id, { status: "missed" });
        rescheduleBlock(block.id);
      }
    });
  }, [blocks, autoAdjusted]);

  async function handleGeneratePlan() {
    setPlanLoading(true);
    try {
      const selectedDay = new Date(date).getDay();
      const todaysAvailability = availability.filter((a) => a.day_of_week === selectedDay);
      const availableMinutes = todaysAvailability.reduce((sum, slot) => {
        const [startH, startM] = slot.start_time.split(":").map(Number);
        const [endH, endM] = slot.end_time.split(":").map(Number);
        return sum + Math.max(0, (endH * 60 + endM) - (startH * 60 + startM));
      }, 0);
      await fetch("/api/planner/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, availableMinutes: availableMinutes || 180, availability }),
      });
      const planRes = await fetch(`/api/planner/plan?date=${date}`);
      const planData = await planRes.json();
      setBlocks(planData?.blocks ?? []);
    } finally {
      setPlanLoading(false);
    }
  }

  async function handleAddAvailability(dayOfWeek: number) {
    await fetch("/api/study/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day_of_week: dayOfWeek, start_time: "16:00", end_time: "18:00", preferred_block_minutes: 45 }),
    });
    const res = await fetch("/api/study/availability");
    const data = res.ok ? await res.json() : [];
    setAvailability(Array.isArray(data) ? data : []);
  }

  async function handleRemoveAvailability(id: string) {
    await fetch(`/api/study/availability?id=${id}`, { method: "DELETE" });
    setAvailability((prev) => prev.filter((a) => a.id !== id));
  }

  async function updateBlock(id: string, updates: Partial<PlannerBlock>) {
    const res = await fetch("/api/study/blocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    const data = await res.json();
    if (data?.block) setBlocks((prev) => prev.map((b) => (b.id === id ? data.block : b)));
  }

  async function rescheduleBlock(id: string) {
    const block = blocks.find((b) => b.id === id);
    if (!block) return;
    const nextStart = new Date(new Date(block.start_time).getTime() + 86400000);
    const nextEnd   = new Date(new Date(block.end_time).getTime()   + 86400000);
    await fetch("/api/study/blocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, start_time: nextStart.toISOString(), end_time: nextEnd.toISOString(), status: "rescheduled" }),
    });
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }

  function handleDragStart(id: string) { setDraggingId(id); }

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    const next = [...blocks];
    const fromIndex = next.findIndex((b) => b.id === draggingId);
    const toIndex   = next.findIndex((b) => b.id === targetId);
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setBlocks(next);
    setDraggingId(null);
    const base = new Date(next[0].start_time);
    next.forEach((block, idx) => {
      const newStart = new Date(base.getTime() + idx * 30 * 60000);
      const newEnd   = new Date(newStart.getTime() + 30 * 60000);
      updateBlock(block.id, { start_time: newStart.toISOString(), end_time: newEnd.toISOString() });
    });
  }

  // Group schedule by day
  const scheduleByDay = schedule.reduce<Record<string, StudyBlock[]>>((acc, b) => {
    (acc[b.day] ??= []).push(b);
    return acc;
  }, {});
  const scheduleDays = Object.keys(scheduleByDay);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 space-y-6">
      <PageHero
        icon={Brain}
        badgeLabel="AI Study Intelligence"
        title="Study Planner"
        description="AI-ranked priorities, smart reminders, a generated weekly schedule, grade-impact analysis, and your own weekly availability planner — all in one place."
      />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton-shimmer h-48 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Danger zones */}
          {dangerZones.length > 0 && (
            <div className="space-y-2">
              {dangerZones.map((dz, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-400" />
                  <p className="text-sm text-rose-200">{dz.label}</p>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Priority queue */}
            <SectionCard
              title="Priority queue"
              subtitle="AI-ranked by urgency, assignment weight, and time needed"
              className="lg:col-span-2"
            >
              {priorities.length === 0 ? (
                <p className="text-sm text-slate-500">No upcoming assignments in the next 3 weeks.</p>
              ) : (
                <div className="space-y-3">
                  {priorities.slice(0, 8).map((item, idx) => (
                    <div
                      key={item.id}
                      className={`flex items-start gap-4 rounded-xl border p-4 ${scoreBg(item.priority_score)}`}
                    >
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/5 text-xs font-bold text-slate-300">
                        #{idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-white truncate">{item.title}</span>
                          <span className="text-xs text-slate-500">{item.course_name}</span>
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-400 capitalize">
                            {item.assignment_type}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> Due {fmtDate(item.due_date)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> ~{fmtMins(item.final_estimated_minutes)}
                          </span>
                          {item.recommended_start && (
                            <span className="flex items-center gap-1">
                              <Zap className="h-3 w-3" /> Start {fmtDate(item.recommended_start)}
                            </span>
                          )}
                        </div>
                        {item.smart_reminder && (
                          <p className="mt-2 text-xs font-medium text-amber-300">{item.smart_reminder}</p>
                        )}
                      </div>
                      <div className={`flex-shrink-0 text-lg font-bold ${scoreColor(item.priority_score)}`}>
                        {item.priority_score}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Weekly schedule */}
            <SectionCard
              title="This week's study plan"
              subtitle="AI-generated schedule fitting assignments before their due dates"
            >
              {scheduleDays.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing scheduled — no upcoming assignments found.</p>
              ) : (
                <div className="space-y-4">
                  {scheduleDays.map((day) => (
                    <div key={day}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">{day}</p>
                      <div className="space-y-1.5">
                        {scheduleByDay[day].map((block, i) => (
                          <div
                            key={i}
                            className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${priorityBadge(block.priority)}`}
                          >
                            <span className="text-xs font-medium">{fmtMins(block.durationMinutes)}</span>
                            <div className="flex-1 min-w-0">
                              <p className="truncate text-xs font-medium text-white">{block.task}</p>
                              <p className="text-[11px] text-slate-500">{block.subject}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Grade impact */}
            <SectionCard
              title="Grade impact"
              subtitle="Upcoming assignments ranked by how much they affect your grade"
            >
              {gradeItems.length === 0 ? (
                <p className="text-sm text-slate-500">No upcoming assignments in the next 3 weeks.</p>
              ) : (
                <div className="space-y-2">
                  {gradeItems.slice(0, 8).map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <div
                        className="h-2 flex-shrink-0 rounded-full"
                        style={{
                          width: `${Math.max(8, item.impactPct * 2)}px`,
                          background: item.courseColor ?? "#6366f1",
                          minWidth: "8px",
                          maxWidth: "100px",
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs font-medium text-white">{item.title}</p>
                        <p className="text-[11px] text-slate-500">{item.courseName} · due {fmtDate(item.due_date)}</p>
                      </div>
                      <span className="flex-shrink-0 text-sm font-semibold text-violet-300">
                        ~{item.impactPct}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Weekly availability + daily planner (merged from the former Planner tab) */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Weekly availability</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {weekdayLabels.map((label, index) => (
                  <div key={label} className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm font-semibold text-foreground">{label}</strong>
                    <div className="flex flex-wrap items-center gap-2">
                      {availability.filter((a) => a.day_of_week === index).map((slot) => (
                        <span key={slot.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                          {slot.start_time}–{slot.end_time}
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleRemoveAvailability(slot.id)}
                          >
                            Remove
                          </Button>
                        </span>
                      ))}
                      <Button variant="secondary" size="sm" type="button" onClick={() => handleAddAvailability(index)}>
                        Add block
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Plan for the day</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="planDate">Plan date</Label>
                  <Input
                    id="planDate"
                    type="date"
                    className="w-fit"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" onClick={handleGeneratePlan} disabled={planLoading}>
                    {planLoading ? "Generating..." : "Generate Plan"}
                  </Button>
                  <Button variant="secondary" asChild>
                    <a href={`/api/planner/export?from=${date}T00:00:00Z&to=${date}T23:59:59Z`}>Export iCal</a>
                  </Button>
                  <Button variant="secondary" type="button" onClick={() => window.print()}>
                    Export PDF
                  </Button>
                </div>

                {blocks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No study blocks scheduled yet. Generate a plan to populate tasks.
                  </p>
                ) : (
                  <div className="grid gap-3">
                    {blocks.map((block) => (
                      <div
                        key={block.id}
                        draggable
                        onDragStart={() => handleDragStart(block.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(block.id)}
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 transition-colors duration-150 hover:border-white/15"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <strong className="text-sm font-semibold text-foreground">{block.title}</strong>
                          <span className="text-xs text-muted-foreground">
                            {new Date(block.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–{
                              new Date(block.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            }
                          </span>
                        </div>
                        {new Date(block.end_time) < new Date() && block.status !== "completed" ? (
                          <div className="mt-1.5 text-xs font-medium text-rose-400">Overdue</div>
                        ) : null}
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <Button variant="secondary" size="sm" onClick={() => updateBlock(block.id, { status: "completed" })}>
                            Mark done
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => rescheduleBlock(block.id)}>
                            Reschedule +1 day
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Workload heatmap */}
          {heatmap.length > 0 && (
            <SectionCard
              title="Workload by week"
              subtitle="Estimated study minutes per week per course"
            >
              <div className="space-y-2">
                {/* Group by week */}
                {Array.from(new Set(heatmap.map((c) => c.week))).map((week) => {
                  const cells = heatmap.filter((c) => c.week === week);
                  const totalMins = cells.reduce((s, c) => s + c.estimatedMinutes, 0);
                  const hasHighStakes = cells.some((c) => c.hasHighStakes);
                  return (
                    <div key={week} className="flex items-center gap-3">
                      <span className="w-20 flex-shrink-0 text-xs text-slate-500">
                        {new Date(week).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                      <div className="flex flex-1 gap-1.5 flex-wrap">
                        {cells.map((cell, i) => (
                          <div
                            key={i}
                            title={`${cell.courseName}: ${fmtMins(cell.estimatedMinutes)}`}
                            className="h-6 rounded"
                            style={{
                              width: `${Math.max(24, cell.estimatedMinutes / 5)}px`,
                              background: cell.courseColor ?? "#6366f1",
                              opacity: 0.75,
                            }}
                          />
                        ))}
                      </div>
                      <span className="w-16 flex-shrink-0 text-right text-xs text-slate-400">{fmtMins(totalMins)}</span>
                      {hasHighStakes && <Flame className="h-3.5 w-3.5 flex-shrink-0 text-rose-400" />}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* Quick links */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { href: "/assignments", icon: BookOpen, label: "All assignments", desc: "View full list" },
              { href: "/practice",    icon: Zap,      label: "Practice now",    desc: "Adaptive quiz" },
              { href: "/review",      icon: Flame,    label: "Review & revise", desc: "Weak topics" },
            ].map(({ href, icon: Icon, label, desc }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-sm font-medium text-slate-300 transition-all duration-150 hover:border-violet-400/25 hover:bg-violet-400/6 hover:text-white"
              >
                <Icon className="h-4 w-4 text-violet-400" />
                <div>
                  <p className="font-medium">{label}</p>
                  <p className="text-[11px] text-slate-500">{desc}</p>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 text-slate-600" />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
