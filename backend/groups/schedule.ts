/**
 * Recurring meeting-slot math for study groups.
 *
 * Pure module: no Supabase imports, `now`/window bounds injected. All math is
 * UTC-based — meeting times are interpreted as UTC wall-clock times, matching
 * how the rest of the app treats dates (UTC calendar days).
 */

export type MeetingSlot = {
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  startTime: string; // "HH:MM" or "HH:MM:SS"
  frequency: "weekly" | "biweekly";
  /** Anchor for biweekly parity — the slot's creation time (ISO). */
  createdAt?: string;
};

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

function parseTime(t: string): { h: number; m: number } {
  const [h, m] = t.split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}

/** Start (ms) of the UTC week (Sunday 00:00) containing `ms`. */
function weekStartUtc(ms: number): number {
  const d = new Date(ms);
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return dayStart - d.getUTCDay() * DAY_MS;
}

/** First occurrence of a slot at or after `fromMs`. */
function occurrenceAtOrAfter(slot: MeetingSlot, fromMs: number): number {
  const { h, m } = parseTime(slot.startTime);
  let candidate = weekStartUtc(fromMs) + slot.dayOfWeek * DAY_MS + (h * 60 + m) * 60_000;
  if (candidate < fromMs) candidate += WEEK_MS;

  if (slot.frequency === "biweekly") {
    // Parity anchored to the week containing the slot's creation; slots without
    // an anchor behave as anchored to epoch week 0.
    const anchorWeek = weekStartUtc(slot.createdAt ? Date.parse(slot.createdAt) : 0);
    const weeksFromAnchor = Math.round((weekStartUtc(candidate) - anchorWeek) / WEEK_MS);
    if (weeksFromAnchor % 2 !== 0) candidate += WEEK_MS;
  }
  return candidate;
}

/** Next occurrence (as a Date) across all slots at or after `now`, or null if no slots. */
export function nextOccurrence(meetings: MeetingSlot[], now: Date): Date | null {
  if (meetings.length === 0) return null;
  let best = Infinity;
  for (const slot of meetings) {
    const t = occurrenceAtOrAfter(slot, now.getTime());
    if (t < best) best = t;
  }
  return Number.isFinite(best) ? new Date(best) : null;
}

/** Count of scheduled occurrences across all slots in [from, to). */
export function occurrencesInWindow(meetings: MeetingSlot[], from: Date, to: Date): number {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (toMs <= fromMs) return 0;
  let count = 0;
  for (const slot of meetings) {
    const step = slot.frequency === "biweekly" ? 2 * WEEK_MS : WEEK_MS;
    for (let t = occurrenceAtOrAfter(slot, fromMs); t < toMs; t += step) {
      count += 1;
    }
  }
  return count;
}
