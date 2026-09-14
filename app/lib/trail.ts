/**
 * A trek drawn as a line with pins — the picture the references keep coming
 * back to: a route winding across a photograph or a terrain, a dotted line,
 * a handful of labelled points along it.
 *
 * Everything here is geometry from data we really have — the day stops with
 * their altitudes — laid out in a unit box (0..100 in both axes) so the same
 * numbers drive an SVG line and absolutely positioned HTML pins. Pure, so the
 * shape of a route is testable and identical everywhere it is drawn.
 */

export interface TrailStop {
  day: number;
  place: string;
  altitude_m: number;
}

export interface TrailPoint {
  /** 0..100 across the box. */
  x: number;
  /** 0..100 down the box — high altitude sits high. */
  y: number;
  stop: TrailStop;
  index: number;
}

/**
 * Where each stop sits.
 *
 * Left to right by day, and up the box by altitude normalised to the route's
 * own span — every route fills its picture, rather than eighteen flat walks
 * and one Everest. A gentle sideways wobble keeps the line from reading as a
 * chart: the wobble is deterministic per stop, so it never jitters between
 * renders or between the server and the browser.
 */
export function layoutTrail(
  stops: TrailStop[],
  box = { left: 8, right: 92, top: 16, bottom: 86 },
): TrailPoint[] {
  const n = stops.length;
  if (n === 0) return [];
  const alts = stops.map((s) => s.altitude_m);
  const lo = Math.min(...alts);
  const hi = Math.max(...alts);
  const span = Math.max(1, hi - lo);
  return stops.map((stop, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const wobble = n > 2 && i > 0 && i < n - 1 ? Math.sin(i * 2.4) * 2.2 : 0;
    const x = box.left + t * (box.right - box.left) + wobble;
    const v = (stop.altitude_m - lo) / span;
    const y = box.bottom - v * (box.bottom - box.top);
    return { x: round(x), y: round(y), stop, index: i };
  });
}

/** An SVG path through the points, softened with quadratic midpoints. */
export function trailPath(points: TrailPoint[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const mx = round((a.x + b.x) / 2);
    const my = round((a.y + b.y) / 2);
    d += ` Q${a.x},${a.y} ${mx},${my}`;
  }
  const last = points[points.length - 1];
  d += ` T${last.x},${last.y}`;
  return d;
}

/** The ground under the line — the same shape, closed to the foot of the box. */
export function trailArea(points: TrailPoint[]): string {
  if (points.length < 2) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${trailPath(points)} L${last.x},100 L${first.x},100 Z`;
}

/**
 * Which stops earn a label.
 *
 * A pin on every day of a 16-day walk is a cloud of pins. The first day, the
 * highest point and the last day always; then the rest spread as evenly as
 * the budget allows. Order preserved so the caller can draw them in sequence.
 */
export function pickPins(points: TrailPoint[], max = 4): TrailPoint[] {
  const n = points.length;
  if (n <= max) return points;
  const summit = points.reduce((best, p) => (p.stop.altitude_m > best.stop.altitude_m ? p : best), points[0]);
  const chosen = new Set<number>([0, summit.index, n - 1]);
  let spare = max - chosen.size;
  if (spare > 0) {
    // Fill the biggest gaps first so the labels spread instead of bunching.
    const step = (n - 1) / (spare + 1);
    for (let k = 1; k <= spare; k++) {
      const idx = Math.round(k * step);
      // Nudge off an already-chosen index rather than dropping the pin.
      let j = idx;
      while (chosen.has(j) && j < n - 1) j++;
      if (!chosen.has(j)) chosen.add(j);
    }
  }
  return points.filter((p) => chosen.has(p.index));
}

/** Highest point along the walk, or null when there is nothing to draw. */
export function summitOf(stops: TrailStop[]): TrailStop | null {
  if (stops.length === 0) return null;
  return stops.reduce((best, s) => (s.altitude_m > best.altitude_m ? s : best), stops[0]);
}

/** A pin's label wants a side to sit on, so it never runs off the edge. */
export function pinSide(p: TrailPoint): "left" | "right" {
  return p.x > 60 ? "left" : "right";
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
