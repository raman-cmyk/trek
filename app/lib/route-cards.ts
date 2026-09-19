import { monthName } from "~/lib/match";
import {
  fromPerPersonUsdCents,
  hasBreakdown,
  type PriceBreakdown,
} from "~/lib/experience-pricing";
import { listPriceUsdCents } from "~/lib/list-price";

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
  /** The price is quoted at the party the trip page opens with. */
  min_party?: number | null;
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
    // The same figure the trip page quotes, so a route card's range and the
    // prices inside it cannot disagree (app/lib/list-price.ts).
    const price = listPriceUsdCents(o as any);
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
  /** Month numbers the route is walked in, for the "when are you coming" filter. */
  season_months?: number[] | null;
}

/**
 * How long you have got, in the shapes a holiday actually comes in.
 *
 * Not a slider. A trekker does not think "between 9 and 13 days"; they think
 * "I have a week" or "I have taken the fortnight off", and the four buckets
 * below split the twenty-four routes 3 / 7 / 8 / 6 — which is what a facet
 * has to do to be worth its line in the panel.
 */
export const LENGTHS: Array<{ value: string; label: string; min: number; max: number }> = [
  { value: "short", label: "Up to 6 days", min: 0, max: 6 },
  { value: "week", label: "7 to 10 days", min: 7, max: 10 },
  { value: "fortnight", label: "11 to 14 days", min: 11, max: 14 },
  { value: "long", label: "15 days or more", min: 15, max: Number.POSITIVE_INFINITY },
];

/** Which bucket a route falls in, or null if it has no length recorded. */
export function lengthOf(days: number | null | undefined): string | null {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return null;
  return LENGTHS.find((l) => d >= l.min && d <= l.max)?.value ?? null;
}

export type SortKey = "altitude" | "days" | "price" | "name";

export const SORTS: Array<[SortKey, string]> = [
  ["altitude", "Highest first"],
  ["days", "Longest first"],
  ["price", "Lowest price"],
  ["name", "A to Z"],
];

/**
 * What the reader has narrowed to. Every field is "all" until they say
 * otherwise, and an unknown value narrows to nothing rather than being
 * quietly ignored — a URL somebody edited by hand should not silently
 * return the whole list as though it had worked.
 */
export interface Facets {
  region?: string;
  grade?: string;
  length?: string;
  /** Month number, 1–12. */
  month?: string;
}

export function matches<T extends Card>(c: T, f: Facets = {}): boolean {
  const { region = "all", grade = "all", length = "all", month = "all" } = f;
  if (region !== "all" && c.region !== region) return false;
  if (grade !== "all" && String(c.difficulty).toLowerCase() !== grade) return false;
  if (length !== "all" && lengthOf(c.typical_days) !== length) return false;
  if (month !== "all") {
    const m = Number(month);
    if (!(c.season_months ?? []).includes(m)) return false;
  }
  return true;
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

/**
 * The months anyone walks in, each with how many routes are in season.
 *
 * Built from the data rather than from January to December: nothing we run
 * is in season in January, and offering a month that returns an empty page
 * is the same lie as a shelf with one card on it. June, July and August come
 * back with three or four — which is the honest answer about the monsoon,
 * and exactly the thing somebody booking for July needs to see.
 */
export function monthsOf(cards: Card[]): Array<{ month: number; label: string; count: number }> {
  const counts = new Map<number, number>();
  for (const c of cards) {
    for (const m of c.season_months ?? []) {
      if (m >= 1 && m <= 12) counts.set(m, (counts.get(m) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([month, count]) => ({ month, label: monthName(month), count }));
}

/**
 * The heading over the grid.
 *
 * It says the same number the filter bar says, because there is one list
 * now. The shelved version counted the shelves from the list minus three
 * featured routes while the bar counted all twenty-four, so the page
 * disagreed with itself in two places a reader could see at once.
 */
export function resultHeading(shown: number, total: number): string {
  if (shown === 0) return "No routes match";
  if (shown === total) return `All ${total} routes`;
  return shown === 1 ? "1 route matches" : `${shown} routes match`;
}

/** The length buckets that actually hold routes, with their counts. */
export function lengthsOf(cards: Card[]): Array<{ value: string; label: string; count: number }> {
  return LENGTHS.map((l) => ({
    value: l.value,
    label: l.label,
    count: cards.filter((c) => lengthOf(c.typical_days) === l.value).length,
  })).filter((l) => l.count > 0);
}

/* ── Regions as the page's own shelves ──────────────────────────────────── */

/**
 * What a region is called here, and what a stranger calls it.
 *
 * The heading keeps the Nepali name, because that is the name on the permit,
 * on the bus and in the guide's mouth — and pretending otherwise is the
 * agency habit this whole product exists against. But a trekker in Berlin
 * types "Everest", not "Khumbu", so the local name carries a line of English
 * beside it rather than being replaced by one.
 *
 * Only the regions whose name hides what they are need a line. "Annapurna"
 * explains itself.
 */
export const REGION_NOTE: Record<string, string> = {
  Khumbu: "the Everest region",
  Solukhumbu: "the lower Everest valleys, walked in",
  Sudurpashchim: "the far west, almost nobody goes",
  Karnali: "the far west lakes",
  Dolpa: "behind the Dhaulagiri wall",
  Mustang: "the old kingdom north of Annapurna",
};

export interface RegionGroup<T> {
  region: string;
  /** The English line, where the name needs one. */
  note: string | null;
  routes: T[];
}

/**
 * The routes on shelves, one per region.
 *
 * A flat grid of twenty-four treks asks a reader to hold twenty-four things
 * in their head and rank them. Nobody does that; they pick a region first —
 * "we want to see Everest" — and choose inside it. So the page is shelved the
 * way the decision is actually made.
 *
 * Busiest region first, because the size of a shelf is a fair signal of where
 * people go, and alphabetical inside a tie so the order never wobbles between
 * renders.
 */
export function groupByRegion<T extends { region: string; name?: string }>(
  cards: T[],
): Array<RegionGroup<T>> {
  const byRegion = new Map<string, T[]>();
  for (const c of cards ?? []) {
    const key = String(c.region ?? "").trim() || "Elsewhere in Nepal";
    if (!byRegion.has(key)) byRegion.set(key, []);
    byRegion.get(key)!.push(c);
  }
  return [...byRegion.entries()]
    .map(([region, routes]) => ({
      region,
      note: REGION_NOTE[region] ?? null,
      routes,
    }))
    .sort(
      (a, b) => b.routes.length - a.routes.length || a.region.localeCompare(b.region),
    );
}
