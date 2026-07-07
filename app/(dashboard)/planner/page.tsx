"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";

type Availability = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  preferred_block_minutes: number;
};

type StudyBlock = {
  id: string;
  title: string;
  task_type: string;
  start_time: string;
  end_time: string;
  status: string;
};

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function PlannerPage() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [blocks, setBlocks] = useState<StudyBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [autoAdjusted, setAutoAdjusted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;
    async function load() {
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
    load();
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
    setLoading(true);
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
      setLoading(false);
    }
  }

  async function handleAddAvailability(dayOfWeek: number) {
    await fetch("/api/study/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day_of_week: dayOfWeek, start_time: "16:00", end_time: "18:00", preferred_block_minutes: 45 }),
    });
    const res = await fetch("/api/study/availability");
    setAvailability((await res.json()) ?? []);
  }

  async function handleRemoveAvailability(id: string) {
    await fetch(`/api/study/availability?id=${id}`, { method: "DELETE" });
    setAvailability((prev) => prev.filter((a) => a.id !== id));
  }

  async function updateBlock(id: string, updates: Partial<StudyBlock>) {
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Study Planner</h1>

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
            <Button type="button" onClick={handleGeneratePlan} disabled={loading}>
              {loading ? "Generating..." : "Generate Plan"}
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
  );
}
