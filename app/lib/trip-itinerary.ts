/**
 * The day-by-day a trip page shows, and where it came from.
 *
 * Measured on production: every live trek carries one itinerary entry, or
 * none, while the route it walks holds a full set of day stops. So "Everest
 * Base Camp, the classic 14 days" answered "what do I actually do for two
 * weeks?" with a single line — on the one section a trekker reads hardest,
 * with fourteen days of the answer sitting one table away.
 *
 * The guide's own itinerary always wins where they have written one that
 * covers the trip. The route's day stops are the floor, not the preference:
 * a guide who has described their own version is describing something the
 * route table does not know about.
 *
 * Where the fallback fires, the page must say so. A route's standard stages
 * presented as this guide's plan is a small lie that becomes a complaint on
 * day three, so `source` travels with the steps and the page prints it.
 */

export interface ItineraryStep {
  day?: number;
  time?: string;
  title: string;
  body?: string;
}

export interface RouteStop {
  day: number;
  place: string;
  altitude_m?: number | null;
}

export interface TripItinerary {
  steps: ItineraryStep[];
  /** "guide" — their own words. "route" — the route's standard stages. */
  source: "guide" | "route";
}

/** Only the entries with something to read. A blank title is not a day. */
export function cleanSteps(raw: unknown): ItineraryStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s: any) => ({
      day: Number.isFinite(Number(s?.day)) && Number(s?.day) > 0 ? Number(s.day) : undefined,
      time: typeof s?.time === "string" && s.time.trim() ? s.time.trim() : undefined,
      title: String(s?.title ?? "").trim(),
      body: typeof s?.body === "string" && s.body.trim() ? s.body.trim() : undefined,
    }))
    .filter((s) => s.title.length > 0);
}

/** A route's stops as days: "Day 3 · Namche Bazaar" with its altitude. */
export function stepsFromRoute(stops: readonly RouteStop[] | null | undefined): ItineraryStep[] {
  if (!stops?.length) return [];
  return [...stops]
    .filter((s) => Number.isFinite(Number(s?.day)) && String(s?.place ?? "").trim())
    .sort((a, b) => a.day - b.day)
    .map((s) => ({
      day: s.day,
      title: String(s.place).trim(),
      // The altitude is the reason a day matters on a trek, so it is the body
      // rather than a fact hidden on another page.
      body: s.altitude_m && s.altitude_m > 0 ? `${s.altitude_m.toLocaleString("en-US")} m` : undefined,
    }));
}

/**
 * What to show, and whose it is.
 *
 * `days` is how long the trip runs. A guide's itinerary counts as covering
 * the trip when it has an entry for most of it — two lines on a fourteen-day
 * trek does not, and that is exactly the case this exists for. A day trip is
 * covered by a single entry, because one evening genuinely is one entry.
 */
export function tripItinerary(
  ownItinerary: unknown,
  routeStops: readonly RouteStop[] | null | undefined,
  days: number,
): TripItinerary {
  const own = cleanSteps(ownItinerary);
  const span = Math.max(1, Math.floor(days || 1));
  // Half the trip is the line: a guide who wrote seven days of a fourteen-day
  // trek is summarising, not stubbing, and their words should still win.
  const covers = span <= 1 ? own.length >= 1 : own.length >= Math.ceil(span / 2);
  if (covers) return { steps: own, source: "guide" };

  const fromRoute = stepsFromRoute(routeStops);
  if (fromRoute.length > own.length) return { steps: fromRoute, source: "route" };
  return { steps: own, source: "guide" };
}
