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

/** One route a guide says they have walked, and how many times. */
export interface WalkedClaim {
  routeId: string;
  times: number;
}

/**
 * The application's route claims, which arrive as JSON from a picker.
 *
 * Parsed defensively and deduplicated: the table's primary key is
 * (guide_id, route_id), so a repeated route would fail the whole insert and
 * lose an application over a double tap. The first claim for a route wins,
 * which is the one they typed deliberately.
 */
export function parseRoutesWalked(raw: unknown): WalkedClaim[] {
  let parsed: unknown;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  const out: WalkedClaim[] = [];
  for (const row of parsed) {
    const routeId = typeof (row as any)?.routeId === "string" ? (row as any).routeId : "";
    const times = parseTimesWalked((row as any)?.times);
    if (!routeId || times === null || seen.has(routeId)) continue;
    seen.add(routeId);
    out.push({ routeId, times });
    if (out.length >= 40) break; // there are two dozen routes; forty is a bug
  }
  return out;
}
