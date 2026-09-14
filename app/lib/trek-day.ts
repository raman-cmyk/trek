/**
 * What a day on the trail actually asks of you.
 *
 * Every competitor's itinerary carries four facts per day — where you walk to,
 * how high it is, how long it takes, where you sleep — and ours carried two.
 * Two of the missing ones we can work out from what we already store, and two
 * we cannot and must not invent.
 *
 *   Climb and drop are ARITHMETIC. The altitudes in `day_stops` are real, so
 *   the metres gained and lost between them are real too. They are computed
 *   here and never stored: a copy of a derived number is a copy that goes
 *   stale the first time somebody corrects an altitude.
 *
 *   Hours are an ESTIMATE, and are labelled as one everywhere they appear,
 *   until a guide or the office types the real number in — which then wins.
 *   Distance per day we do not know at all, so we say nothing.
 *
 * The estimate is deliberately a band, not a figure. Nobody walks a day in
 * "5.4 hours", and a single number implies a precision we have not got.
 */

export interface RouteStop {
  day: number;
  place: string;
  altitude_m: number;
  note?: string | null;
  /** Typed in by the guide or the office — beats the estimate. */
  hours?: string | null;
  /** Kilometres for this day, when somebody knows them. */
  km?: number | null;
  /** Where you sleep that night: "Teahouse", "Dormitory", "Camp". */
  sleep?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface DayLeg {
  day: number;
  place: string;
  altitude_m: number;
  note: string | null;
  /** Metres climbed since the last stop. Exact. */
  up: number;
  /** Metres dropped since the last stop. Exact. */
  down: number;
  km: number | null;
  sleep: string | null;
  /** What to print for the time, and whether anybody actually measured it. */
  hours: string | null;
  hoursEstimated: boolean;
  /** Same place as yesterday and no climb — an acclimatisation day. */
  rest: boolean;
}

/**
 * The days, each knowing what it costs against the one before it.
 *
 * The first day has nothing before it, so it claims no climb: we know where it
 * ends, not where it began, and "1,200 m of ascent" on day one would be a
 * guess dressed as a fact.
 */
export function legsOf(stops: RouteStop[]): DayLeg[] {
  // `Number(null)` is 0, and 0 is finite — so a stop with no altitude used to
  // come through as sea level and invent a 3,000 m descent into it.
  const clean = (stops ?? []).filter(
    (s) => s && s.altitude_m != null && s.altitude_m !== ("" as any) && Number.isFinite(Number(s.altitude_m)),
  );
  return clean.map((s, i) => {
    const prev = i > 0 ? clean[i - 1] : null;
    const delta = prev ? Number(s.altitude_m) - Number(prev.altitude_m) : 0;
    const up = delta > 0 ? delta : 0;
    const down = delta < 0 ? -delta : 0;
    // Two nights in one place is an acclimatisation day up high and simply a
    // night in Kathmandu down low. Calling the flight home a "rest day" is the
    // kind of small wrongness that makes a reader distrust the whole page.
    const rest = Boolean(prev && prev.place === s.place && delta === 0 && Number(s.altitude_m) >= 3000);
    const typed = (s.hours ?? "").toString().trim();
    return {
      day: Number(s.day) || i + 1,
      place: s.place,
      altitude_m: Number(s.altitude_m),
      note: s.note ?? null,
      up,
      down,
      km: s.km == null ? null : Number(s.km),
      sleep: (s.sleep ?? "").toString().trim() || null,
      hours:
        typed ||
        estimateHours({
          up,
          down,
          altitude_m: Number(s.altitude_m),
          rest,
          // The first and last days are how you arrive and how you leave — a
          // flight, a jeep, or a walk, and we do not know which. Six hours of
          // "walking" to Kathmandu on the last line of an itinerary is worse
          // than no number at all.
          first: i === 0 || i === clean.length - 1,
        }),
      hoursEstimated: !typed,
      rest,
    };
  });
}

/**
 * Roughly how long a day takes, from how much it climbs.
 *
 * Naismith's rule was written for Scottish hills and a walker with a light
 * pack; on a Nepali teahouse trail with a full one it runs about an hour fast
 * a day. This is the shape trekking outfits actually quote: a base of three
 * hours for any real day, an hour for every 350 m of climb, an hour for every
 * 700 m of descent — Nepali descents are stone staircases, and they are slower
 * than people expect — and a little more above 4,000 m, where everybody slows
 * down whether they mean to or not.
 *
 * Returned as a band and rounded to the half hour, because that is the
 * precision the thing genuinely has.
 */
export function estimateHours(leg: {
  up: number;
  down: number;
  altitude_m: number;
  rest?: boolean;
  first?: boolean;
}): string | null {
  // The arrival and departure days are usually a drive or a flight. We do not
  // know which, so we say nothing rather than something.
  if (leg.first) return null;
  if (leg.rest) return "2–4 hr";
  // Nobody walks 1,000 m down and ends up in Kathmandu or Pokhara. A day that
  // drops that far and finishes below 2,000 m is a flight or a jeep out of the
  // mountains, and "about 6 hr" against it reads as six hours of walking.
  if (leg.down >= 1000 && leg.altitude_m < 2000) return null;

  let h = 3 + leg.up / 350 + leg.down / 700;
  if (leg.altitude_m >= 5000) h *= 1.3;
  else if (leg.altitude_m >= 4000) h *= 1.15;

  // Clamped at both ends: a day is never under two hours once it is a walking
  // day, and a figure over about eleven is the model failing rather than a
  // real day — nobody schedules a fourteen-hour teahouse stage.
  const lo = Math.min(11, Math.max(2, Math.round(h * 2) / 2));
  const hi = Math.min(12, lo + 1);
  return `${trim(lo)}–${trim(hi)} hr`;
}

/** Everything the walk climbs, added up. The number nobody quotes and everybody feels. */
export function totalAscent(stops: RouteStop[]): number {
  return legsOf(stops).reduce((sum, l) => sum + l.up, 0);
}

export function totalDescent(stops: RouteStop[]): number {
  return legsOf(stops).reduce((sum, l) => sum + l.down, 0);
}

/** The biggest single day's climb — the one that decides how hard this is. */
export function hardestDay(stops: RouteStop[]): DayLeg | null {
  const legs = legsOf(stops);
  if (legs.length === 0) return null;
  return legs.reduce((best, l) => (l.up > best.up ? l : best), legs[0]);
}

/** How many days are rest days — what an honest acclimatisation plan looks like. */
export function restDays(stops: RouteStop[]): number {
  return legsOf(stops).filter((l) => l.rest).length;
}

/**
 * Does this walk climb faster than the mountains allow?
 *
 * The rule every guidebook gives is 300–500 m of sleeping altitude a day above
 * 3,000 m. A route that breaks it is not necessarily wrong — a day can drop
 * again — but it is worth saying out loud on the page rather than letting
 * somebody find out at Lobuche.
 */
export function fastClimbDays(stops: RouteStop[], limit = 600): DayLeg[] {
  return legsOf(stops).filter((l) => l.altitude_m >= 3000 && l.up > limit);
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}
