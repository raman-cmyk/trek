/**
 * One pin per place, not one pin per day.
 *
 * The founder's report: "it shows 1 and when I try to track 2 it gets
 * overlapped by 11 because they are in the same place in Day 2 and 11."
 *
 * Almost every Nepal trek is an out-and-back. You sleep in Namche on the way
 * up and again on the way down, so two day-stops share one set of
 * coordinates, two markers land on the same pixel, and the later day sits on
 * top of the earlier one. Scrubbing to Day 2 grew a pin nobody could see,
 * underneath Day 11.
 *
 * A pin per PLACE is also the truer picture: Namche is one village you pass
 * twice, not two villages. So the pin carries every day spent there — "2 · 11"
 * — and lights up when any of them is the day you are looking at.
 */

export interface LocatedStop {
  day: number;
  place: string;
  altitude_m: number;
  lat?: number | null;
  lng?: number | null;
}

export interface StopGroup {
  /** Every day spent here, in order. */
  days: number[];
  place: string;
  altitude_m: number;
  lat: number;
  lng: number;
  /** Position along the walk, used to pick the start and the end. */
  firstDay: number;
  lastDay: number;
}

/**
 * Five decimals is about a metre — finer than any itinerary is written, and
 * coarse enough that two entries for the same lodge typed on different days
 * land together.
 */
function key(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/** A stop we can actually draw: coordinates present and real. */
export interface PlacedStop {
  day: number;
  place: string;
  altitude_m: number;
  lat: number;
  lng: number;
}

/** Stops that can actually be drawn, in day order. */
export function locatedStops(stops: LocatedStop[]): PlacedStop[] {
  const out: PlacedStop[] = [];
  for (const s of stops) {
    const lat = s.lat;
    const lng = s.lng;
    if (lat == null || lng == null) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ day: s.day, place: s.place, altitude_m: s.altitude_m, lat, lng });
  }
  return out.sort((a, b) => a.day - b.day);
}

/** One entry per place, carrying every day spent there. */
export function groupStops(stops: LocatedStop[]): StopGroup[] {
  const byPlace = new Map<string, StopGroup>();
  for (const s of locatedStops(stops)) {
    const k = key(s.lat, s.lng);
    const found = byPlace.get(k);
    if (found) {
      found.days.push(s.day);
      found.lastDay = Math.max(found.lastDay, s.day);
      found.firstDay = Math.min(found.firstDay, s.day);
      // The altitude should not change between two nights in one village; if
      // the itinerary disagrees with itself, the first entry wins rather than
      // the last, so the pin matches the profile going up.
    } else {
      byPlace.set(k, {
        days: [s.day],
        place: s.place,
        altitude_m: s.altitude_m,
        lat: s.lat,
        lng: s.lng,
        firstDay: s.day,
        lastDay: s.day,
      });
    }
  }
  return [...byPlace.values()]
    .map((g) => ({ ...g, days: [...g.days].sort((a, b) => a - b) }))
    .sort((a, b) => a.firstDay - b.firstDay);
}

/**
 * What the pin says.
 *
 * "2 · 11" for a place you pass twice; "2–4" when the days run together,
 * because three separate numbers on a 24px circle is unreadable and "2–4" is
 * what a person would write.
 */
export function pinLabel(days: number[]): string {
  if (!days.length) return "";
  const sorted = [...days].sort((a, b) => a - b);
  const runs: number[][] = [[sorted[0]]];
  for (const d of sorted.slice(1)) {
    const run = runs[runs.length - 1];
    if (d === run[run.length - 1] + 1) run.push(d);
    else runs.push([d]);
  }
  return runs
    .map((r) => (r.length > 2 ? `${r[0]}–${r[r.length - 1]}` : r.join(" · ")))
    .join(" · ");
}

/** Is the day being scrubbed to one of this pin's days? */
export function groupIsActive(group: StopGroup, activeDay: number | null | undefined): boolean {
  return activeDay != null && group.days.includes(activeDay);
}

/** The highest place on the walk — worth marking, it is why people came. */
export function highestGroup(groups: StopGroup[]): StopGroup | null {
  if (!groups.length) return null;
  return groups.reduce((best, g) => (g.altitude_m > best.altitude_m ? g : best), groups[0]);
}

/**
 * The line, in walking order, one coordinate per DAY rather than per place.
 *
 * An out-and-back has to go back down the way it came, and drawing the
 * grouped places in order would cut the corner — you would see a triangle
 * where the trail is a there-and-back.
 */
export function routeLine(stops: LocatedStop[]): [number, number][] {
  return locatedStops(stops).map((s) => [s.lng, s.lat]);
}

/**
 * How a pin's days read in its popup: "Day 2 and Day 11", "Days 2, 3 and 4".
 */
export function daysSentence(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 1) return `Day ${sorted[0]}`;
  const head = sorted.slice(0, -1).join(", ");
  return `Days ${head} and ${sorted[sorted.length - 1]}`;
}
