"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, BookOpen, Brain, Calendar, ChevronRight,
  Clock, Flame, Zap,
} from "lucide-react";
import { PageHero } from "@/frontend/components/ui/page-hero";

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
        description="AI-ranked priorities, smart reminders, a generated weekly schedule, and grade-impact analysis — all in one place."
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
