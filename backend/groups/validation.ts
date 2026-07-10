/**
 * Creation-payload validation for goal-bound study groups.
 *
 * Pure module: no Supabase imports, `now` injected — unit-testable without a DB,
 * and the single source of truth for every 400 the POST /api/groups route returns.
 */
import { z } from "zod";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const meetingSlotSchema = z.object({
  dayOfWeek: z
    .number({ invalid_type_error: "Meeting day must be a number (0–6)." })
    .int("Meeting day must be a whole number.")
    .min(0, "Meeting day must be between 0 (Sunday) and 6 (Saturday).")
    .max(6, "Meeting day must be between 0 (Sunday) and 6 (Saturday)."),
  startTime: z
    .string({ invalid_type_error: "Meeting time must be a string." })
    .regex(TIME_RE, "Meeting time must be in 24-hour HH:MM format."),
  frequency: z.enum(["weekly", "biweekly"], {
    errorMap: () => ({ message: "Meeting frequency must be weekly or biweekly." }),
  }),
});

export const createGroupSchema = z.object({
  name: z
    .string({ required_error: "Group name is required." })
    .trim()
    .min(1, "Group name is required.")
    .max(80, "Group name must be 80 characters or fewer."),
  description: z.string().trim().max(500, "Description must be 500 characters or fewer.").optional(),
  courseId: z.string().uuid("courseId must be a valid id.").nullish(),
  goal: z
    .string({ required_error: "A goal is required — every group is created around one." })
    .trim()
    .min(1, "A goal is required — every group is created around one.")
    .max(500, "Goal must be 500 characters or fewer."),
  targetEndDate: z
    .string({ required_error: "A target end date is required." })
    .regex(DATE_RE, "Target end date must be in YYYY-MM-DD format."),
  meetings: z
    .array(meetingSlotSchema, { required_error: "At least one recurring meeting slot is required." })
    .min(1, "At least one recurring meeting slot is required.")
    .max(7, "A group can have at most 7 meeting slots."),
});

export type MeetingSlotInput = z.infer<typeof meetingSlotSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export type ValidationResult =
  | { ok: true; value: CreateGroupInput }
  | { ok: false; error: string };

/** UTC calendar date (YYYY-MM-DD) for a Date. */
export function toUtcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const TWO_YEARS_DAYS = 731;

export function validateCreateGroup(body: unknown, now: Date): ValidationResult {
  const parsed = createGroupSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid group payload." };
  }
  const value = parsed.data;

  // Target date must be a real calendar date, strictly in the future (UTC days),
  // and within a sane horizon (2 years).
  const [y, m, d] = value.targetEndDate.split("-").map(Number);
  const targetUtc = Date.UTC(y, m - 1, d);
  const roundTrip = new Date(targetUtc);
  if (
    roundTrip.getUTCFullYear() !== y ||
    roundTrip.getUTCMonth() !== m - 1 ||
    roundTrip.getUTCDate() !== d
  ) {
    return { ok: false, error: "Target end date is not a real calendar date." };
  }
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (targetUtc <= todayUtc) {
    return { ok: false, error: "Target end date must be in the future." };
  }
  if (targetUtc - todayUtc > TWO_YEARS_DAYS * 86_400_000) {
    return { ok: false, error: "Target end date must be within the next 2 years." };
  }

  // No duplicate (day, time) slots.
  const seen = new Set<string>();
  for (const slot of value.meetings) {
    const key = `${slot.dayOfWeek}@${slot.startTime}`;
    if (seen.has(key)) {
      return { ok: false, error: "Meeting slots must be unique (duplicate day and time)." };
    }
    seen.add(key);
  }

  return { ok: true, value };
}
