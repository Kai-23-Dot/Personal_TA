"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";

// Native <select> styled to match shared Input/Select — same pattern as
// NATIVE_SELECT_CLASS in the practice page (Radix Select forbids the empty
// string values these tiny enums don't need anyway).
const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background/50 px-2 text-sm shadow-sm transition-all duration-200 ease-smooth-out hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring/60";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MAX_SLOTS = 7;

export type MeetingSlotDraft = {
  dayOfWeek: number;
  startTime: string; // HH:MM, "" while incomplete
  frequency: "weekly" | "biweekly";
};

export function emptySlot(): MeetingSlotDraft {
  return { dayOfWeek: 1, startTime: "", frequency: "weekly" };
}

export function slotsAreValid(slots: MeetingSlotDraft[]): boolean {
  if (slots.length === 0) return false;
  const seen = new Set<string>();
  for (const s of slots) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.startTime)) return false;
    const key = `${s.dayOfWeek}@${s.startTime}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/**
 * Recurring meeting-slot editor for group creation. A group cannot exist
 * without a standing meeting, so the minimum is one row (remove is disabled
 * on the last one).
 */
export function MeetingSlotBuilder({
  slots,
  onChange,
}: {
  slots: MeetingSlotDraft[];
  onChange: (slots: MeetingSlotDraft[]) => void;
}) {
  function update(index: number, patch: Partial<MeetingSlotDraft>) {
    onChange(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  return (
    <div className="space-y-2">
      {slots.map((slot, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Meeting day"
            className={SELECT_CLASS}
            value={slot.dayOfWeek}
            onChange={(e) => update(i, { dayOfWeek: Number(e.target.value) })}
          >
            {DAY_LABELS.map((label, day) => (
              <option key={day} value={day}>{label}</option>
            ))}
          </select>
          <input
            aria-label="Meeting time"
            type="time"
            required
            className={SELECT_CLASS}
            value={slot.startTime}
            onChange={(e) => update(i, { startTime: e.target.value })}
          />
          <select
            aria-label="Meeting frequency"
            className={SELECT_CLASS}
            value={slot.frequency}
            onChange={(e) => update(i, { frequency: e.target.value as "weekly" | "biweekly" })}
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
          </select>
          <button
            type="button"
            aria-label="Remove meeting slot"
            disabled={slots.length <= 1}
            onClick={() => onChange(slots.filter((_, j) => j !== i))}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-white/5 hover:text-rose-400 disabled:pointer-events-none disabled:opacity-30"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {slots.length < MAX_SLOTS && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange([...slots, emptySlot()])}
        >
          <Plus className="h-3.5 w-3.5" /> Add another slot
        </Button>
      )}
    </div>
  );
}
