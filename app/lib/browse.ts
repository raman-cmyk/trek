/**
 * Pure helpers behind browse search — the date window and the text match.
 * The queries that use them live in browse.server.ts.
 */

export interface DateRange {
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd, inclusive
}

/**
 * A date that is the right shape AND a date that exists.
 *
 * `/experiences?from=9999-99-99` returned a 500. The shape regex below passed
 * it — four digits, two, two — and then `new Date("9999-99-99T00:00:00Z")` is
 * an Invalid Date, whose `toISOString()` throws RangeError rather than
 * returning anything. So a mangled link, a crawler, or a typed URL took the
 * whole browse page down. Same on /guides.
 *
 * Round-tripped on purpose: `2026-02-30` parses without complaint and silently
 * becomes 2 March, which would show somebody results for a date they did not
 * ask for. A day that does not exist is a typo, and a typo is not a filter.
 */
export function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === iso;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  // Defensive: four modules in this codebase have their own addDays, and this
  // one is exported and reachable from a URL. An unparseable input returns the
  // input rather than throwing out of whatever page called it.
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysInRange(r: DateRange): number {
  return Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86400000) + 1;
}

/**
 * How far past a departure date to look when nobody gave an end date.
 *
 * Somebody who says "I set off on the 12th of October" has not said they are
 * leaving on the 13th — they have said roughly when, and the trek is however
 * long the trek is. Treating a lone date as a one-day window asked the
 * calendar "who is free for exactly one day", which finds a guide with a
 * single gap between two treks and misses everybody actually free to walk.
 *
 * A month covers the longest route in the catalogue with room to spare, and
 * the run-length check downstream is what turns the window into an answer.
 */
export const DEPARTURE_WINDOW_DAYS = 30;

/** Parse ?from=&to= into a sane, bounded range. Returns null if unusable. */
export function parseRange(
  fromRaw: string | null,
  toRaw: string | null,
  today: string,
): DateRange | null {
  if (!fromRaw || !isRealDate(fromRaw)) return null;
  const from = fromRaw < today ? today : fromRaw;
  let to =
    toRaw && isRealDate(toRaw) ? toRaw : addDays(from, DEPARTURE_WINDOW_DAYS);
  // A backwards end date is a typo, not a request for a one-day trek.
  if (to < from) to = addDays(from, DEPARTURE_WINDOW_DAYS);
  // A year is as far ahead as any guide's calendar goes; without a cap a
  // pasted "2099-01-01" would pull an unbounded availability scan.
  const cap = addDays(from, 365);
  if (to > cap) to = cap;
  return { from, to };
}

/** PostgREST `or=` filters are comma/paren-delimited; a raw % or , breaks them. */
export function escapeLike(s: string): string {
  return s.replace(/[,()\\]/g, " ").replace(/%/g, "").trim();
}

/** Free-text match against a guide's own record. */
export function guideMatchesText(
  g: {
    full_name: string;
    home_district: string | null;
    hook_line: string | null;
    bio?: string | null;
    only_with_me?: string | null;
  },
  q: string,
): boolean {
  const n = q.toLowerCase();
  return (
    g.full_name.toLowerCase().includes(n) ||
    (g.home_district ?? "").toLowerCase().includes(n) ||
    (g.hook_line ?? "").toLowerCase().includes(n) ||
    (g.only_with_me ?? "").toLowerCase().includes(n) ||
    (g.bio ?? "").toLowerCase().includes(n)
  );
}
