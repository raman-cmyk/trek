/**
 * Searching the routes.
 *
 * The routes page listed all 24 and gave a reader no way to say "Annapurna",
 * "something easy", or "I can only go in October" — on a page whose whole job
 * is to get somebody from a mountain to a guide. This is that search, and it
 * is pure: there are 24 rows, they are all on the page already, and a
 * filter that runs in memory can be tested without a database.
 *
 * Text is AND-of-words, not one substring: "easy langtang" and "annapurna
 * circuit" both behave the way somebody typing them expects, and neither
 * needs a full-text index.
 */

export interface SearchableRoute {
  name: string;
  region: string | null;
  difficulty: string | null;
  typical_days: number | null;
  max_altitude_m: number | null;
  season_months: number[] | null;
  /** The article's one-line summary, when the route has an article. */
  teaser?: string | null;
  /** The route's own summary sentence, which every route has. */
  summary?: string | null;
}

export interface RouteFilters {
  q: string;
  region: string;
  difficulty: string;
  /** A day band key — see DAY_BANDS. */
  days: string;
  /** 1–12, as a string from the form. */
  month: string;
}

/**
 * How long you are away, in the words people use. The bands are cut where
 * Nepal's routes actually sit: a long weekend, a fortnight's holiday, and
 * the month-long ones.
 */
export const DAY_BANDS = [
  { key: "short", label: "5 days or under", min: 1, max: 5 },
  { key: "week", label: "6 to 10 days", min: 6, max: 10 },
  { key: "long", label: "11 days or more", min: 11, max: 365 },
] as const;

export const EMPTY_FILTERS: RouteFilters = {
  q: "",
  region: "",
  difficulty: "",
  days: "",
  month: "",
};

/** Read the filters out of a query string, ignoring anything malformed. */
export function parseRouteFilters(p: URLSearchParams): RouteFilters {
  const month = (p.get("month") ?? "").trim();
  const days = (p.get("days") ?? "").trim();
  const monthNum = Number(month);
  return {
    q: (p.get("q") ?? "").trim().slice(0, 80),
    region: (p.get("region") ?? "").trim().slice(0, 60),
    difficulty: (p.get("difficulty") ?? "").trim().slice(0, 30),
    days: DAY_BANDS.some((b) => b.key === days) ? days : "",
    month: Number.isInteger(monthNum) && monthNum >= 1 && monthNum <= 12 ? String(monthNum) : "",
  };
}

export function isNarrowed(f: RouteFilters): boolean {
  return !!(f.q || f.region || f.difficulty || f.days || f.month);
}

/** Everything about a route that a word could reasonably match. */
function haystack(r: SearchableRoute): string {
  return [
    r.name,
    r.region,
    r.difficulty,
    r.teaser,
    r.summary,
    // So "10 days" and "5400m" find something, which is how people who have
    // read one blog post about Nepal actually search.
    r.typical_days != null ? `${r.typical_days} days` : null,
    r.max_altitude_m != null ? `${r.max_altitude_m}m` : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function routeMatchesText(r: SearchableRoute, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = haystack(r);
  return words.every((w) => hay.includes(w));
}

export function matchesDays(r: SearchableRoute, bandKey: string): boolean {
  const band = DAY_BANDS.find((b) => b.key === bandKey);
  if (!band) return true;
  const d = r.typical_days;
  return d != null && d >= band.min && d <= band.max;
}

export function matchesMonth(r: SearchableRoute, month: string): boolean {
  if (!month) return true;
  const m = Number(month);
  // A route with no season recorded is not claimed to be out of season.
  if (!r.season_months || r.season_months.length === 0) return true;
  return r.season_months.includes(m);
}

export function filterRoutes<T extends SearchableRoute>(rows: T[], f: RouteFilters): T[] {
  return rows.filter(
    (r) =>
      routeMatchesText(r, f.q) &&
      (!f.region || r.region === f.region) &&
      (!f.difficulty || r.difficulty === f.difficulty) &&
      matchesDays(r, f.days) &&
      matchesMonth(r, f.month),
  );
}

/**
 * The facet lists, built from every route rather than from the current
 * results — a dropdown that shrinks to whatever the last search left is a
 * dropdown you cannot use to widen it again.
 */
export function routeFacets(rows: SearchableRoute[]): {
  regions: string[];
  difficulties: string[];
} {
  const regions = new Set<string>();
  const difficulties = new Set<string>();
  for (const r of rows) {
    if (r.region) regions.add(r.region);
    if (r.difficulty) difficulties.add(r.difficulty);
  }
  return {
    regions: [...regions].sort((a, b) => a.localeCompare(b)),
    // Easiest first, whatever order the rows arrived in.
    difficulties: [...difficulties].sort(
      (a, b) => difficultyRank(a) - difficultyRank(b) || a.localeCompare(b),
    ),
  };
}

const DIFFICULTY_ORDER = ["easy", "moderate", "challenging", "hard", "strenuous", "extreme"];

function difficultyRank(d: string): number {
  const i = DIFFICULTY_ORDER.indexOf(d.toLowerCase());
  return i === -1 ? DIFFICULTY_ORDER.length : i;
}
