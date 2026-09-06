/**
 * Course colour identity.
 *
 * A student carries five to seven courses at once, and the thing they do most
 * often in this app is scan a mixed list — today's assignments, this week's
 * deadlines — looking for one course. Giving each course a stable colour turns
 * that scan into a colour match instead of a read.
 *
 * The tone has to be stable for a given course across every page and every
 * session, so it is derived from a stable property of the course rather than
 * from list order: "Bio is the green one" only helps if green never moves.
 * Pass the course NAME, not the id — the assignment payload exposes only
 * `{ name, color }`, so name is the one key available on every surface, and
 * keying two surfaces differently would give one course two colours.
 *
 * Courses may carry a `color` from the upstream LMS, but those are arbitrary
 * per-provider values that clash on a light canvas, so they are not used.
 *
 * Tones 1-7 are defined in app/notion-workspace.css as Notion's page-tag
 * pastels, applied via the data-course-tone attribute.
 */
export const COURSE_TONE_COUNT = 7;

export function courseTone(courseKey: string | number | null | undefined): number {
  if (courseKey === null || courseKey === undefined) return COURSE_TONE_COUNT;
  const key = String(courseKey);
  // FNV-1a. Any stable hash works; this one is short and avoids the clustering
  // a plain character sum shows on keys that share a long prefix (course names
  // within one term routinely do, e.g. "AP Govt/Polit YL - …").
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % COURSE_TONE_COUNT) + 1;
}
