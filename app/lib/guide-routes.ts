/**
 * A guide's claim about a route: how many times they have walked it.
 *
 * Shared so the profile editor and the office's correction form clamp the
 * same way, and so the bound lives next to the CHECK it mirrors rather than
 * being retyped at each call site.
 */

/** A guide leading twenty treks a year for twenty-five years is at five
 *  hundred. A larger number is a typo, not a career — and it is the CHECK on
 *  guide_route_experience.times_walked. */
export const MAX_TIMES_WALKED = 500;

/**
 * A whole number of times walked, or null if it isn't one. Null rather than a
 * default, so a caller has to decide what an unusable value means instead of
 * quietly saving a 1 the guide never typed.
 */
export function parseTimesWalked(v: unknown): number | null {
  const n = Math.round(Number(typeof v === "string" ? v.trim() : v));
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(MAX_TIMES_WALKED, n);
}
