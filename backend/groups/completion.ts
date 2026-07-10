/**
 * Goal-status derivation and the completion metric.
 *
 * "% of groups that complete their stated goal" is the number this feature
 * exists to make measurable — most platforms can't compute it because their
 * groups have no defined end. Pure module: `now` injected, no Supabase.
 */

export type GoalStatus = "no_goal" | "active" | "completed" | "ended_incomplete";

export type GoalFields = {
  goal: string | null;
  targetEndDate: string | null; // YYYY-MM-DD
  goalCompletedAt: string | null;
};

function dateStringToUtc(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

function todayUtc(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/**
 * Precedence: no goal → no_goal; completed (regardless of timing — completing
 * late still counts) → completed; past target date → ended_incomplete; else active.
 */
export function deriveGoalStatus(g: GoalFields, now: Date): GoalStatus {
  if (!g.goal || !g.targetEndDate) return "no_goal";
  if (g.goalCompletedAt) return "completed";
  if (todayUtc(now) > dateStringToUtc(g.targetEndDate)) return "ended_incomplete";
  return "active";
}

export type CompletionStats = {
  /** Goal-bound groups whose outcome is known (completed or ended incomplete). */
  eligibleGroups: number;
  completedGoals: number;
  endedIncomplete: number;
  /** Goal-bound groups still in flight. */
  activeGoals: number;
  /** Legacy groups without goals — never enter the metric. */
  legacyGroups: number;
  /** completedGoals / eligibleGroups, or null when no outcomes are known yet. */
  completionRate: number | null;
};

export function computeCompletionStats(groups: GoalFields[], now: Date): CompletionStats {
  let completedGoals = 0;
  let endedIncomplete = 0;
  let activeGoals = 0;
  let legacyGroups = 0;

  for (const g of groups) {
    switch (deriveGoalStatus(g, now)) {
      case "completed":
        completedGoals += 1;
        break;
      case "ended_incomplete":
        endedIncomplete += 1;
        break;
      case "active":
        activeGoals += 1;
        break;
      case "no_goal":
        legacyGroups += 1;
        break;
    }
  }

  const eligibleGroups = completedGoals + endedIncomplete;
  return {
    eligibleGroups,
    completedGoals,
    endedIncomplete,
    activeGoals,
    legacyGroups,
    completionRate: eligibleGroups === 0 ? null : completedGoals / eligibleGroups,
  };
}
