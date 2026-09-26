/**
 * The accuracy thresholds that decide what still counts as work to do.
 *
 * These were previously implicit: the recommendation copy banded topics at 50
 * and 70, the chat context filtered at 70, the review page's heading promised
 * "below 70%" while its query just took the lowest five whatever they scored,
 * and study priorities filtered nothing at all — so a topic you had already
 * brought up to mastery kept being offered as the next thing to practise.
 *
 * Two thresholds, because two different questions are being asked.
 */

/**
 * At or above this, a topic is done and drops out of study priorities.
 *
 * Matches the `mastered` band that submit_practice_session writes to
 * performance_metrics.mastery_level (migration 015), so the API and the
 * database agree on what "mastered" means.
 */
export const MASTERY_THRESHOLD_PCT = 85;

/**
 * Below this, a topic is weak enough to call out by name.
 *
 * This is the number the review page's own heading promises the reader
 * ("Topics where your practice accuracy is below 70%"), and the one the AI
 * assistant already uses when it picks what to bring up.
 */
export const WEAK_THRESHOLD_PCT = 70;

/** A topic the student has finished with, for now. */
export function isMastered(accuracyPct: number | null | undefined): boolean {
  return typeof accuracyPct === "number" && accuracyPct >= MASTERY_THRESHOLD_PCT;
}

/**
 * Below this, a topic gets deliberately targeted when an adaptive test is
 * generated.
 *
 * Stricter than WEAK_THRESHOLD_PCT on purpose: "worth telling the student
 * about" and "worth spending questions on" are different bars, and pulling
 * every sub-70 topic into every adaptive test would crowd out the material the
 * test was actually asked for. Kept at the value practice generation already
 * used, so this names existing behaviour rather than changing it.
 */
export const ADAPTIVE_TARGET_THRESHOLD_PCT = 60;
