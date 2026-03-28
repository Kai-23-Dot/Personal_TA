"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";

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
  const [focusSessionId, setFocusSessionId] = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(1500);
  const [timerRunning, setTimerRunning] = useState(false);

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
        const loadedBlocks = planData?.blocks ?? [];
        setBlocks(loadedBlocks);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [date]);

  useEffect(() => {
    if (blocks.length === 0) return;
    // Auto-mark overdue blocks and reschedule to keep plan current.
    blocks.forEach((block) => {
      if (autoAdjusted[block.id]) return;
      if (new Date(block.end_time) < new Date() && block.status === "scheduled") {
        setAutoAdjusted((prev) => ({ ...prev, [block.id]: true }));
        updateBlock(block.id, { status: "missed" });
        rescheduleBlock(block.id);
      }
    });
  }, [blocks, autoAdjusted]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setTimerSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  const formattedTimer = useMemo(() => {
    const minutes = Math.floor(timerSeconds / 60);
    const seconds = timerSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [timerSeconds]);

  async function handleGeneratePlan() {
    setLoading(true);
    try {
      const selectedDay = new Date(date).getDay();
      const todaysAvailability = availability.filter((a) => a.day_of_week === selectedDay);
      const availableMinutes = todaysAvailability.reduce((sum, slot) => {
        const [startH, startM] = slot.start_time.split(":").map(Number);
        const [endH, endM] = slot.end_time.split(":").map(Number);
        const minutes = (endH * 60 + endM) - (startH * 60 + startM);
        return sum + Math.max(0, minutes);
      }, 0);
      await fetch("/api/planner/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          availableMinutes: availableMinutes || 180,
          availability,
        }),
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
      body: JSON.stringify({
        day_of_week: dayOfWeek,
        start_time: "16:00",
        end_time: "18:00",
        preferred_block_minutes: 45,
      }),
    });
    const res = await fetch("/api/study/availability");
    const data = await res.json();
    setAvailability(data ?? []);
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
    if (data?.block) {
      setBlocks((prev) => prev.map((b) => (b.id === id ? data.block : b)));
    }
  }

  async function rescheduleBlock(id: string) {
    const block = blocks.find((b) => b.id === id);
    if (!block) return;
    const start = new Date(block.start_time);
    const end = new Date(block.end_time);
    const nextStart = new Date(start.getTime() + 86400000);
    const nextEnd = new Date(end.getTime() + 86400000);

    await fetch("/api/study/blocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        start_time: nextStart.toISOString(),
        end_time: nextEnd.toISOString(),
        status: "rescheduled",
      }),
    });
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }

  async function startFocus(blockId: string) {
    const res = await fetch("/api/focus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studyBlockId: blockId }),
    });
    const data = await res.json();
    setFocusSessionId(data?.session?.id ?? null);
    setTimerSeconds(1500);
    setTimerRunning(true);
  }

  async function stopFocus(status: "completed" | "cancelled") {
    if (!focusSessionId) return;
    await fetch("/api/focus", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: focusSessionId, status }),
    });
    setTimerRunning(false);
    setFocusSessionId(null);
  }

  function handleDragStart(id: string) {
    setDraggingId(id);
  }

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    const next = [...blocks];
    const fromIndex = next.findIndex((b) => b.id === draggingId);
    const toIndex = next.findIndex((b) => b.id === targetId);
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setBlocks(next);
    setDraggingId(null);

    // Reassign start times in order (30-minute increments) to persist the new order
    const base = new Date(next[0].start_time);
    next.forEach((block, idx) => {
      const newStart = new Date(base.getTime() + idx * 30 * 60000);
      const newEnd = new Date(newStart.getTime() + 30 * 60000);
      updateBlock(block.id, { start_time: newStart.toISOString(), end_time: newEnd.toISOString() });
    });
  }

  return (
    <section className="section">
      <h2 className="animate-on-scroll">Study Planner</h2>

      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Weekly availability</h3>
          <div style={{ display: "grid", gap: "0.6rem" }}>
            {weekdayLabels.map((label, index) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ color: "var(--light)" }}>{label}</strong>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  {availability.filter((a) => a.day_of_week === index).map((slot) => (
                    <span key={slot.id} style={{ color: "var(--gray)" }}>
                      {slot.start_time}–{slot.end_time}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ marginLeft: "0.5rem" }}
                        onClick={() => handleRemoveAvailability(slot.id)}
                      >
                        Remove
                      </button>
                    </span>
                  ))}
                  <button className="btn btn-secondary" type="button" onClick={() => handleAddAvailability(index)}>
                    Add block
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "2rem auto 0" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Plan for the day</h3>
          <div className="contact-form">
            <div className="form-field">
              <label htmlFor="planDate">Plan date</label>
              <input id="planDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <button className="contact-submit-btn" type="button" onClick={handleGeneratePlan} disabled={loading}>
              {loading ? "Generating..." : "Generate Plan"}
            </button>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
              <a className="btn btn-secondary" href={`/api/planner/export?from=${date}T00:00:00Z&to=${date}T23:59:59Z`}>
                Export iCal
              </a>
              <button className="btn btn-secondary" type="button" onClick={() => window.print()}>
                Export PDF
              </button>
            </div>
          </div>

          {blocks.length === 0 ? (
            <p style={{ color: "var(--gray)", marginTop: "1rem" }}>
              No study blocks scheduled yet. Generate a plan to populate tasks.
            </p>
          ) : (
            <div style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
              {blocks.map((block) => (
                <div
                  key={block.id}
                  draggable
                  onDragStart={() => handleDragStart(block.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(block.id)}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "12px",
                    padding: "0.9rem 1rem",
                    background: "rgba(9,14,24,0.5)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ color: "var(--light)" }}>{block.title}</strong>
                    <span style={{ color: "var(--gray)", fontSize: "0.9rem" }}>
                      {new Date(block.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–{
                        new Date(block.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      }
                    </span>
                  </div>
                  {new Date(block.end_time) < new Date() && block.status !== "completed" ? (
                    <div style={{ color: "#ff6b6b", marginTop: "0.4rem" }}>Overdue</div>
                  ) : null}
                  <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                    <button className="btn btn-secondary" onClick={() => updateBlock(block.id, { status: "completed" })}>
                      Mark done
                    </button>
                    <button className="btn btn-secondary" onClick={() => rescheduleBlock(block.id)}>
                      Reschedule +1 day
                    </button>
                    <button className="btn btn-primary" onClick={() => startFocus(block.id)}>
                      Focus timer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="contact-info-section animate-on-scroll" style={{ maxWidth: "900px", margin: "2rem auto 0" }}>
        <div className="contact-form-column">
          <h3 className="contact-form-title">Focus session</h3>
          <p style={{ color: "var(--light)" }}>{formattedTimer}</p>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button className="btn btn-secondary" type="button" onClick={() => setTimerRunning((v) => !v)}>
              {timerRunning ? "Pause" : "Start"}
            </button>
            <button className="btn btn-primary" type="button" onClick={() => stopFocus("completed")}>
              Complete session
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => stopFocus("cancelled")}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
