/**
 * Where a person stands on a trail, and what the walk looks like in section.
 *
 * "Don't just show the line — label the trek and show the guides doing that
 * trek along that trail."
 *
 * Until now a guide's face sat at the centre of their home district, which is
 * true and useless: it piles everybody around Kathmandu and says nothing
 * about the walk. When a trek is chosen, the people who actually run it step
 * ONTO the route — spread along the line they walk, in the order they appear
 * in the list. The map stops being a scatter of residents and starts being a
 * picture of a specific journey with specific people on it.
 *
 * All pure, because the interesting part is the spacing and it should not
 * need a GPU to test.
 */

export type LngLat = [number, number];

/** Rough metres per degree, good enough for spacing faces along a path. */
const M_PER_DEG = 111_320;

export function segmentLength(a: LngLat, b: LngLat): number {
  // Longitude degrees shrink with latitude; at 28°N that is a 12% error if
  // ignored, which is a visibly lopsided row of faces across a long trek.
  const midLat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * Math.cos(midLat);
  const dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy) * M_PER_DEG;
}

/** Total walking length of a line, in metres. */
export function lineLength(coords: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += segmentLength(coords[i - 1], coords[i]);
  return total;
}

/**
 * The point a given fraction (0-1) of the way along a line.
 *
 * By DISTANCE, not by vertex index. A route's day stops are not evenly
 * spaced — a rest day in Namche is one vertex and a 20km valley walk is
 * another — so stepping by index bunches every face into whichever part of
 * the trek had the most short days.
 */
export function pointAt(coords: LngLat[], t: number): LngLat {
  if (coords.length === 0) return [84, 28.4];
  if (coords.length === 1) return coords[0];
  const target = Math.max(0, Math.min(1, t)) * lineLength(coords);
  let walked = 0;
  for (let i = 1; i < coords.length; i++) {
    const seg = segmentLength(coords[i - 1], coords[i]);
    if (walked + seg >= target || i === coords.length - 1) {
      const into = seg === 0 ? 0 : (target - walked) / seg;
      const clamped = Math.max(0, Math.min(1, into));
      return [
        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * clamped,
        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * clamped,
      ];
    }
    walked += seg;
  }
  return coords[coords.length - 1];
}

/**
 * Stand `count` people along a trail.
 *
 * Inset from both ends: a face exactly on the trailhead overlaps the start
 * marker and a face on the summit covers the thing people came to look at.
 * One person stands at the middle of the walk rather than at one end.
 */
export function placeAlongLine(coords: LngLat[], count: number, inset = 0.08): LngLat[] {
  if (count <= 0 || coords.length < 2) return [];
  if (count === 1) return [pointAt(coords, 0.5)];
  const span = 1 - inset * 2;
  return Array.from({ length: count }, (_, i) =>
    pointAt(coords, inset + (i / (count - 1)) * span),
  );
}

export interface ProfilePoint {
  day: number;
  place: string;
  altitudeM: number;
}

export interface Profile {
  /** SVG path through the elevation, in a 0-100 x 0-100 box. */
  path: string;
  /** The same, closed to the floor, for the fill under it. */
  area: string;
  lowM: number;
  highM: number;
  /** The highest stop, for the one label worth drawing. */
  peak: ProfilePoint | null;
  points: { x: number; y: number; point: ProfilePoint }[];
}

/**
 * The walk in section: what the trek actually asks of your lungs.
 *
 * A number — "5,644 m" — is the summit and tells you nothing about the shape
 * of getting there. Everest Base Camp and Mardi Himal both "go up"; one of
 * them goes up for a fortnight. The profile is the single most decision-
 * useful thing we know about a trek and it has never been on the map.
 *
 * Y is inverted for SVG (0 at the top) and padded top and bottom so the peak
 * is not clipped by the stroke width.
 */
export function elevationProfile(stops: ProfilePoint[], pad = 6): Profile | null {
  const usable = stops.filter((s) => Number.isFinite(s.altitudeM) && s.altitudeM > 0);
  if (usable.length < 2) return null;

  const alts = usable.map((s) => s.altitudeM);
  const lowM = Math.min(...alts);
  const highM = Math.max(...alts);
  // A dead-flat walk would divide by zero; draw it as a flat line instead.
  const range = highM - lowM || 1;

  const points = usable.map((point, i) => ({
    x: (i / (usable.length - 1)) * 100,
    y: pad + (1 - (point.altitudeM - lowM) / range) * (100 - pad * 2),
    point,
  }));

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${round(p.x)} ${round(p.y)}`)
    .join(" ");

  const peak = usable.reduce((a, b) => (b.altitudeM > a.altitudeM ? b : a), usable[0]);

  return {
    path,
    area: `${path} L100 100 L0 100 Z`,
    lowM,
    highM,
    peak,
    points,
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** "2,800 m → 5,644 m" — the two numbers the shape is drawn between. */
export function profileRange(p: Profile): string {
  const m = (n: number) => `${Math.round(n).toLocaleString("en-US")} m`;
  return `${m(p.lowM)} → ${m(p.highM)}`;
}
