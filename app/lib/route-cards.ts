import { monthName } from "~/lib/match";
import {
  fromPerPersonUsdCents,
  hasBreakdown,
  type PriceBreakdown,
} from "~/lib/experience-pricing";

/**
 * What a route card is made of.
 *
 * The signature visual on /routes is the real shape of each trek — its
 * elevation profile, drawn from the altitudes in `day_stops`, not from a
 * generator. Twenty-four walks that all look like the same green hill would
 * be a decoration; these are the actual climbs, so Poon Hill reads short and
 * gentle beside the Three Passes' three teeth, and that difference is the
 * argument the page is making.
 */

export interface Stop {
  day: number;
  place: string;
  altitude_m: number;
}

export interface ProfilePoint {
  /** 0..1 along the walk. */
  t: number;
  /** 0..1 of this route's own altitude span — 1 is its highest point. */
  v: number;
  day: number;
  place: string;
  altitude_m: number;
}

export interface Profile {
  points: ProfilePoint[];
  /** Index of the highest stop, for the marker. */
  summit: number;
  lowest: number;
  highest: number;
}

/**
 * The real profile, normalised against the route's own low and high.
 *
 * Normalising per route rather than against Nepal means every card fills its
 * box — the alternative is eighteen flat lines and one Everest — and the
 * metres printed on the card carry the absolute scale.
 */
export function profileOf(stops: Stop[] | null | undefined): Profile | null {
  const clean = (stops ?? [])
    .filter((s) => Number(s?.altitude_m) > 0)
    .map((s) => ({ ...s, altitude_m: Number(s.altitude_m) }));
  if (clean.length < 2) return null;

  const alts = clean.map((s) => s.altitude_m);
  const lowest = Math.min(...alts);
  const highest = Math.max(...alts);
  const span = highest - lowest || 1;
  const last = clean.length - 1;

  const points = clean.map((s, i) => ({
    t: i / last,
    v: (s.altitude_m - lowest) / span,
    day: s.day,
    place: s.place,
    altitude_m: s.altitude_m,
  }));
  return { points, summit: alts.indexOf(highest), lowest, highest };
}

/** An SVG path through the points, with a rounded corner at each stop. */
export function profilePath(
  p: Profile,
  w: number,
  h: number,
  pad = { x: 8, top: 16, bottom: 10 },
): { line: string; area: string; summit: { x: number; y: number } } {
  const x = (t: number) => pad.x + t * (w - pad.x * 2);
  const y = (v: number) => pad.top + (1 - v) * (h - pad.top - pad.bottom);
  const line = p.points
    .map((pt, i) => `${i === 0 ? "M" : "L"}${x(pt.t).toFixed(1)},${y(pt.v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z`;
  const s = p.points[p.summit];
  return { line, area, summit: { x: x(s.t), y: y(s.v) } };
}

/* ─────────────────────────── money ─────────────────────────────────── */

export interface Offering {
  route_id: string;
  guide_id: string | null;
  price_usd_cents: number | null;
  price_breakdown?: unknown;
  max_party?: number | null;
}

export interface Spread {
  lo: number | null;
  hi: number | null;
  guides: number;
}

/**
 * The price of a route is a range, because a route does not have a price —
 * guides do. Ten guides walk Langtang at ten day rates, and "from $398" hides
 * the nine of them who are not the cheapest. Low and high, and the card says
 * which guide is which when you open it.
 */
export function priceSpread(offerings: Offering[]): Spread {
  let lo: number | null = null;
  let hi: number | null = null;
  const guides = new Set<string>();

  for (const o of offerings) {
    if (o.guide_id) guides.add(o.guide_id);
    const bd = (o.price_breakdown ?? null) as PriceBreakdown | null;
    const price = hasBreakdown(bd)
      ? fromPerPersonUsdCents(bd, o.max_party ?? null)
      : (o.price_usd_cents ?? null);
    if (price == null || price <= 0) continue;
    if (lo == null || price < lo) lo = price;
    if (hi == null || price > hi) hi = price;
  }
  return { lo, hi, guides: guides.size };
}

/** True when the two ends are far enough apart to be worth printing both. */
export function isRange(s: Spread): boolean {
  return s.lo != null && s.hi != null && s.hi - s.lo >= 100;
}

/* ─────────────────────────── labels ────────────────────────────────── */

/** "Mar–May · Oct–Nov" from a list of month numbers. */
export function seasonLabel(months: number[] | null | undefined): string {
  const sorted = [...(months ?? [])].sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  const ranges: Array<[number, number]> = [];
  for (const m of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && m === last[1] + 1) last[1] = m;
    else ranges.push([m, m]);
  }
  return ranges
    .map(([a, b]) =>
      a === b ? monthName(a).slice(0, 3) : `${monthName(a).slice(0, 3)}–${monthName(b).slice(0, 3)}`,
    )
    .join(" · ");
}

export const GRADES = ["easy", "moderate", "hard", "strenuous"] as const;
export type Grade = (typeof GRADES)[number];

/** 1–4, for the four-triangle glyph. Anything unrecognised sits in the middle. */
export function gradeLevel(difficulty: string | null | undefined): number {
  const i = GRADES.indexOf(String(difficulty ?? "").toLowerCase() as Grade);
  return i < 0 ? 2 : i + 1;
}

/* ─────────────────────────── filtering ─────────────────────────────── */

export interface Card {
  slug: string;
  name: string;
  region: string;
  typical_days: number;
  max_altitude_m: number;
  difficulty: string;
  guides: number;
  lo: number | null;
}

export type SortKey = "altitude" | "days" | "price" | "name";

export const SORTS: Array<[SortKey, string]> = [
  ["altitude", "Highest first"],
  ["days", "Longest first"],
  ["price", "Lowest price"],
  ["name", "A to Z"],
];

export function matches<T extends Card>(c: T, region: string, grade: string): boolean {
  return (
    (region === "all" || c.region === region) &&
    (grade === "all" || String(c.difficulty).toLowerCase() === grade)
  );
}

/**
 * Sorted for browsing. A route nobody has listed yet has no price, and it
 * goes last under "lowest price" rather than first — a missing number is not
 * a bargain.
 */
export function sortCards<T extends Card>(cards: T[], key: SortKey): T[] {
  const out = [...cards];
  out.sort((a, b) => {
    if (key === "altitude") return b.max_altitude_m - a.max_altitude_m;
    if (key === "days") return b.typical_days - a.typical_days;
    if (key === "price") {
      if (a.lo == null && b.lo == null) return a.name.localeCompare(b.name);
      if (a.lo == null) return 1;
      if (b.lo == null) return -1;
      return a.lo - b.lo;
    }
    return a.name.localeCompare(b.name);
  });
  return out;
}

/** Regions in the list, each with how many routes it holds. */
export function regionsOf(cards: Card[]): Array<{ region: string; count: number }> {
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(c.region, (counts.get(c.region) ?? 0) + 1);
  return [...counts.entries()]
    .map(([region, count]) => ({ region, count }))
    .sort((a, b) => b.count - a.count || a.region.localeCompare(b.region));
}
