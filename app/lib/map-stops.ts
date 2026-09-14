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

/**
 * Walking days and travelling days are not the same line.
 *
 * Nearly every itinerary in the catalogue ends by flying or driving home:
 * Lukla to Kathmandu is a plane, Ghorepani to Pokhara is a jeep, Jumla to
 * Kathmandu is 389km. Drawn as a trekking line those legs are absurd, and
 * worse, they set the map's bounds — so the Everest Base Camp trek rendered
 * as a small squiggle in the corner of a map mostly showing the Terai.
 *
 * A day covering more than this in a straight line was not walked. Trails
 * wander, so a 30km straight line means forty-something on the ground, which
 * nobody does with a pack on.
 */
export const MAX_WALKING_KM = 30;

/** Rough great-circle kilometres. Good to a percent at these distances. */
export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Leg {
  kind: "walk" | "travel";
  from: PlacedStop;
  to: PlacedStop;
  km: number;
}

/** Every leg of the itinerary, each marked as walked or travelled. */
export function legsOfRoute(stops: LocatedStop[]): Leg[] {
  const placed = locatedStops(stops);
  const out: Leg[] = [];
  for (let i = 1; i < placed.length; i++) {
    const from = placed[i - 1];
    const to = placed[i];
    const km = kmBetween(from, to);
    // Two nights in one village is not a leg at all, but it is harmless here
    // and reads as a zero-length walk.
    out.push({ kind: km > MAX_WALKING_KM ? "travel" : "walk", from, to, km });
  }
  return out;
}

/**
 * The part of the map worth framing: everything you actually walk.
 *
 * Falls back to every stop when a route is all travel or has only one point,
 * because a map framed on nothing is worse than a map framed too wide.
 */
export function walkingBounds(
  stops: LocatedStop[],
): { west: number; south: number; east: number; north: number } | null {
  const placed = locatedStops(stops);
  if (!placed.length) return null;
  const legs = legsOfRoute(stops);
  const walked = new Set<PlacedStop>();
  for (const l of legs) {
    if (l.kind !== "walk") continue;
    walked.add(l.from);
    walked.add(l.to);
  }
  const pts = walked.size >= 2 ? [...walked] : placed;
  return {
    west: Math.min(...pts.map((p) => p.lng)),
    south: Math.min(...pts.map((p) => p.lat)),
    east: Math.max(...pts.map((p) => p.lng)),
    north: Math.max(...pts.map((p) => p.lat)),
  };
}

/** Was this place only ever reached by plane or jeep? */
export function isTravelOnly(group: StopGroup, legs: Leg[]): boolean {
  const touching = legs.filter(
    (l) => sameSpot(l.from, group) || sameSpot(l.to, group),
  );
  return touching.length > 0 && touching.every((l) => l.kind === "travel");
}

function sameSpot(p: { lat: number; lng: number }, g: StopGroup): boolean {
  return Math.abs(p.lat - g.lat) < 1e-4 && Math.abs(p.lng - g.lng) < 1e-4;
}

/** The coordinates of one kind of leg, as separate line segments. */
export function legCoords(legs: Leg[], kind: "walk" | "travel"): [number, number][][] {
  return legs
    .filter((l) => l.kind === kind)
    .map((l) => [
      [l.from.lng, l.from.lat],
      [l.to.lng, l.to.lat],
    ] as [number, number][]);
}

/**
 * Nudging pins apart when they land on top of each other.
 *
 * Fifteen numbered pins on one screen of a hundred-kilometre trek will always
 * collide — Manang and Yak Kharka are six kilometres apart, which is a few
 * pixels when the whole circuit is in frame. MapLibre declutters its own
 * symbol layers, but those need a glyph server this style does not have, so
 * the pins are HTML and the collision work has to be ours.
 *
 * The first version of this hid the losing pin behind a small dot. That is
 * the standard answer and it was wrong here, because it recreates the exact
 * complaint it was meant to fix: "some numbers get skipped". A day that
 * disappears from the map is a day the reader thinks we lost.
 *
 * So nothing is hidden. A colliding pin is pushed a few pixels off its point
 * until it is clear, keeping its number. Displacement is capped, and searched
 * outwards so the smallest nudge that works is the one used — the pin should
 * still obviously belong to its place.
 */
export interface PinBox<T> {
  key: T;
  x: number;
  y: number;
  w: number;
  h: number;
  priority: number;
}

/**
 * How far a pin may be pushed off its true position before we give up.
 *
 * Has to exceed the pin's own width or the search can never separate two that
 * start on the same pixel — the first version capped this at 26 against a
 * 30px pin and quietly nudged nothing at all. Beyond about this, though, a
 * pin stops reading as belonging to its village, so crowding past it is left
 * overlapping rather than flung across the valley.
 */
export const MAX_PIN_NUDGE = 44;

function hits<T>(a: { x: number; y: number; w: number; h: number }, kept: PinBox<T>[], pad: number) {
  return kept.some(
    (k) =>
      Math.abs(a.x - k.x) * 2 < a.w + k.w + pad * 2 &&
      Math.abs(a.y - k.y) * 2 < a.h + k.h + pad * 2,
  );
}

/**
 * Where each pin should actually be drawn, as a pixel offset from its point.
 * Pins that do not collide get {0,0} and are not in the map at all.
 */
export function spreadPins<T>(boxes: PinBox<T>[], pad = 3): Map<T, { dx: number; dy: number }> {
  const moved = new Map<T, { dx: number; dy: number }>();
  const kept: PinBox<T>[] = [];

  for (const b of [...boxes].sort((a, z) => a.priority - z.priority)) {
    if (!hits(b, kept, pad)) {
      kept.push(b);
      continue;
    }
    // Outwards in rings, eight directions each. Up first: a pin above its
    // point reads as a label for it, which is what a map reader expects.
    let placed = false;
    for (let r = 12; r <= MAX_PIN_NUDGE && !placed; r += 8) {
      for (const [ux, uy] of [
        [0, -1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [1, 1], [-1, 1],
      ]) {
        const dx = ux * r;
        const dy = uy * r;
        const candidate = { ...b, x: b.x + dx, y: b.y + dy };
        if (hits(candidate, kept, pad)) continue;
        moved.set(b.key, { dx, dy });
        kept.push(candidate);
        placed = true;
        break;
      }
    }
    // Nowhere clear within the cap: leave it where it is rather than fling it
    // across the valley. It overlaps, but it is on its own village.
    if (!placed) kept.push(b);
  }
  return moved;
}
