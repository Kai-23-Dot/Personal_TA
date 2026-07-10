/**
 * Group health engine — the live signal that tells members (and the owner)
 * whether a group is on track before it silently dies.
 *
 * Pure module: no Supabase imports; `now` is an explicit input so results are
 * deterministic and unit-testable. All date math uses UTC calendar days.
 *
 * Scoring (0–100):
 *   attendance  0–50  distinct member-day check-ins vs expected member-sessions
 *                     over the last 14 days (window clamped to group age)
 *   streak      0–20  consecutive ISO(-ish, Sunday-start UTC) weeks with ≥1
 *                     check-in from anyone, ending at the current week, cap 4
 *   progress    0–30  progress_pct vs elapsed fraction of the goal window
 *                     (pace ratio, clamped)
 *
 * Overdue rule: past target_end_date and not completed → total capped at 45
 * (a group that missed its date can never look better than at-risk).
 *
 * State precedence: unscored (no goal) > completed > new (grace) > scored.
 * Grace: group age < 7 days AND zero meeting occurrences elapsed since creation.
 *
 * Tiers: ≥75 thriving · ≥50 steady · ≥25 at-risk · <25 critical.
 */
import { occurrencesInWindow, type MeetingSlot } from "./schedule";

const DAY_MS = 86_400_000;
const ATTENDANCE_WINDOW_DAYS = 14;
const GRACE_AGE_DAYS = 7;
const OVERDUE_SCORE_CAP = 45;

export type HealthTier = "thriving" | "steady" | "at-risk" | "critical";

export type GroupHealth =
  | { state: "unscored" }
  | { state: "completed" }
  | { state: "new" }
  | {
      state: "scored";
      score: number;
      tier: HealthTier;
      components: { attendance: number; streak: number; progress: number };
    };

export type HealthInput = {
  memberCount: number;
  /** Check-ins — only the last 28 days are needed. */
  checkins: { userId: string; checkinDate: string }[];
  meetings: MeetingSlot[];
  createdAt: string; // group.created_at (ISO timestamp)
  targetEndDate: string | null; // YYYY-MM-DD
  goalCompletedAt: string | null;
  /** Owner-maintained progress toward the goal, 0–100. */
  progressPct: number;
  /** Whether the group has a goal at all (legacy groups don't). */
  goal: string | null;
  now: Date;
};

function utcDayStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function dateStringToUtc(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

/** Start (ms) of the Sunday-anchored UTC week containing `ms`. */
function weekStart(ms: number): number {
  const day = utcDayStart(ms);
  return day - new Date(day).getUTCDay() * DAY_MS;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function tierForScore(score: number): HealthTier {
  if (score >= 75) return "thriving";
  if (score >= 50) return "steady";
  if (score >= 25) return "at-risk";
  return "critical";
}

export function computeGroupHealth(input: HealthInput): GroupHealth {
  const { now } = input;
  const nowMs = now.getTime();

  // Precedence 1: legacy groups without goals are never scored.
  if (!input.goal || !input.targetEndDate) return { state: "unscored" };

  // Precedence 2: completed goals stop being scored — the group succeeded.
  if (input.goalCompletedAt) return { state: "completed" };

  // Precedence 3: grace period for brand-new groups.
  const createdMs = Date.parse(input.createdAt);
  const ageDays = (nowMs - createdMs) / DAY_MS;
  const elapsedOccurrences = occurrencesInWindow(input.meetings, new Date(createdMs), now);
  if (ageDays < GRACE_AGE_DAYS && elapsedOccurrences === 0) return { state: "new" };

  // ── Attendance (0–50) ──
  const windowStartMs = Math.max(createdMs, nowMs - ATTENDANCE_WINDOW_DAYS * DAY_MS);
  const expectedSessions = Math.max(
    1,
    occurrencesInWindow(input.meetings, new Date(windowStartMs), now)
  );
  const memberCount = Math.max(1, input.memberCount);
  const windowStartDay = utcDayStart(windowStartMs);
  const distinctMemberDays = new Set(
    input.checkins
      .filter((c) => dateStringToUtc(c.checkinDate) >= windowStartDay)
      .map((c) => `${c.userId}@${c.checkinDate}`)
  ).size;
  const attendance = 50 * clamp(distinctMemberDays / (memberCount * expectedSessions), 0, 1);

  // ── Streak (0–20): consecutive weeks (ending now) with ≥1 check-in ──
  const weeksWithCheckin = new Set(
    input.checkins.map((c) => weekStart(dateStringToUtc(c.checkinDate)))
  );
  let streakWeeks = 0;
  for (let w = weekStart(nowMs); weeksWithCheckin.has(w) && streakWeeks < 4; w -= 7 * DAY_MS) {
    streakWeeks += 1;
  }
  const streak = 20 * (streakWeeks / 4);

  // ── Progress (0–30): progress vs elapsed fraction of the goal window ──
  const targetMs = dateStringToUtc(input.targetEndDate);
  const totalWindow = targetMs - utcDayStart(createdMs);
  const elapsedFrac =
    totalWindow <= 0 ? 1 : clamp((utcDayStart(nowMs) - utcDayStart(createdMs)) / totalWindow, 0, 1);
  const paceRatio = (clamp(input.progressPct, 0, 100) / 100) / Math.max(elapsedFrac, 0.05);
  const progress = 30 * clamp(paceRatio, 0, 1);

  let score = Math.round(attendance + streak + progress);

  // Overdue and incomplete: never better than at-risk.
  if (utcDayStart(nowMs) > targetMs) score = Math.min(score, OVERDUE_SCORE_CAP);

  return {
    state: "scored",
    score,
    tier: tierForScore(score),
    components: {
      attendance: Math.round(attendance),
      streak: Math.round(streak),
      progress: Math.round(progress),
    },
  };
}

/**
 * Per-member consecutive-day check-in streaks (UTC days), counting back from
 * today — or from yesterday, so a streak isn't reported broken before the
 * member has had a chance to check in today.
 */
export function computeMemberStreaks(
  checkins: { userId: string; checkinDate: string }[],
  now: Date
): Record<string, number> {
  const byUser = new Map<string, Set<number>>();
  for (const c of checkins) {
    if (!byUser.has(c.userId)) byUser.set(c.userId, new Set());
    byUser.get(c.userId)!.add(dateStringToUtc(c.checkinDate));
  }

  const today = utcDayStart(now.getTime());
  const streaks: Record<string, number> = {};
  for (const [userId, days] of byUser) {
    let cursor = days.has(today) ? today : today - DAY_MS;
    let streak = 0;
    while (days.has(cursor)) {
      streak += 1;
      cursor -= DAY_MS;
    }
    streaks[userId] = streak;
  }
  return streaks;
}
