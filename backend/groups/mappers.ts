/**
 * DB-row → pure-logic-input mappers, shared by every group API route so the
 * snake_case ↔ camelCase translation lives in exactly one place.
 * Pure module: no Supabase imports.
 */
import { computeGroupHealth, type GroupHealth } from "./health";
import { deriveGoalStatus, type GoalStatus } from "./completion";
import { nextOccurrence, type MeetingSlot } from "./schedule";

export type MeetingRow = {
  day_of_week: number;
  start_time: string;
  frequency: string;
  created_at?: string | null;
};

export type CheckinRow = {
  user_id: string;
  checkin_date: string;
};

export type GroupGoalRow = {
  goal: string | null;
  target_end_date: string | null;
  goal_completed_at: string | null;
  progress_pct: number | null;
  created_at: string;
};

export function toMeetingSlots(rows: MeetingRow[]): MeetingSlot[] {
  return rows.map((r) => ({
    dayOfWeek: r.day_of_week,
    startTime: r.start_time,
    frequency: r.frequency === "biweekly" ? "biweekly" : "weekly",
    createdAt: r.created_at ?? undefined,
  }));
}

export function toCheckinInputs(rows: CheckinRow[]): { userId: string; checkinDate: string }[] {
  return rows.map((r) => ({ userId: r.user_id, checkinDate: r.checkin_date }));
}

/** Everything a group card / detail header needs, derived in one call. */
export function deriveGroupSignals(
  group: GroupGoalRow,
  meetingRows: MeetingRow[],
  checkinRows: CheckinRow[],
  memberCount: number,
  now: Date
): {
  health: GroupHealth;
  goalStatus: GoalStatus;
  nextMeetingAt: string | null;
} {
  const meetings = toMeetingSlots(meetingRows);
  return {
    health: computeGroupHealth({
      memberCount,
      checkins: toCheckinInputs(checkinRows),
      meetings,
      createdAt: group.created_at,
      targetEndDate: group.target_end_date,
      goalCompletedAt: group.goal_completed_at,
      progressPct: group.progress_pct ?? 0,
      goal: group.goal,
      now,
    }),
    goalStatus: deriveGoalStatus(
      {
        goal: group.goal,
        targetEndDate: group.target_end_date,
        goalCompletedAt: group.goal_completed_at,
      },
      now
    ),
    nextMeetingAt: nextOccurrence(meetings, now)?.toISOString() ?? null,
  };
}
