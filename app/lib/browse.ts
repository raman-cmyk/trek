/**
 * Pure helpers behind browse search — the date window and the text match.
 * The queries that use them live in browse.server.ts.
 */

export interface DateRange {
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd, inclusive
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysInRange(r: DateRange): number {
  return Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86400000) + 1;
}

/** Parse ?from=&to= into a sane, bounded range. Returns null if unusable. */
export function parseRange(
  fromRaw: string | null,
  toRaw: string | null,
  today: string,
): DateRange | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!fromRaw || !iso.test(fromRaw)) return null;
  const from = fromRaw < today ? today : fromRaw;
  let to = toRaw && iso.test(toRaw) ? toRaw : from;
  if (to < from) to = from;
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
  },
  q: string,
): boolean {
  const n = q.toLowerCase();
  return (
    g.full_name.toLowerCase().includes(n) ||
    (g.home_district ?? "").toLowerCase().includes(n) ||
    (g.hook_line ?? "").toLowerCase().includes(n) ||
    (g.bio ?? "").toLowerCase().includes(n)
  );
}
