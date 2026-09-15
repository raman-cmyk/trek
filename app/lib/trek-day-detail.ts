/**
 * What a day on this route actually does to you.
 *
 * The day list had a description all along — "Rice terraces, waterfalls, warm
 * air", "Into the gorge" — and hid it inside a collapsed row, so twelve days
 * read as twelve rows of bare numbers. Showing it is half the fix. The other
 * half is that the numbers themselves carry information nobody was reading
 * out: a 530m sleeping gain at 4,050m is the day a trekker needs warning
 * about, and the altitudes to know that are already stored, exactly.
 *
 * So these are derived observations, and every one of them is derived from a
 * stored altitude against a published rule — never invented, and the rule is
 * named on the page so a reader can judge it. The bands are the ones altitude
 * medicine uses; the 300–500m nightly guidance is the standard advice above
 * 3,000m.
 */

/** Above this, altitude illness is possible at all. */
export const AMS_FLOOR_M = 2_500;
/** Above this, the nightly-gain guidance applies. */
export const GAIN_RULE_FLOOR_M = 3_000;
/** The nightly sleeping gain the guidance recommends staying inside. */
export const NIGHTLY_GAIN_M = 500;

export interface DayFactsIn {
  day: number;
  place: string;
  altitude_m: number;
  up: number;
  down: number;
  rest: boolean;
  /** Last night's sleeping altitude, or null on day one. */
  sleptAtM: number | null;
  /** The highest sleeping altitude on the whole route. */
  routeHighM: number | null;
}

export type DetailTone = "note" | "watch" | "relief";

export interface DayDetail {
  tone: DetailTone;
  text: string;
}

function m(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")}m`;
}

/**
 * The observations worth printing under a day, strongest first.
 *
 * Capped at two: a list of five caveats under every day is a list nobody
 * reads, and the two that matter are always the altitude and the exception.
 */
export function dayDetail(d: DayFactsIn): DayDetail[] {
  const out: DayDetail[] = [];
  const gain = d.sleptAtM == null ? 0 : d.altitude_m - d.sleptAtM;

  // The pass or the high camp — the day the route is planned around.
  if (d.routeHighM != null && d.altitude_m === d.routeHighM && d.altitude_m >= AMS_FLOOR_M) {
    out.push({
      tone: "watch",
      text: `The highest you sleep on this route, at ${m(d.altitude_m)}. Everything before it is preparation for tonight.`,
    });
  }

  if (d.rest) {
    out.push({
      tone: "note",
      text: `A rest day is not a day off — you walk up a few hundred metres and come back down to sleep, which is what actually acclimatises you.`,
    });
  } else if (d.sleptAtM != null && d.altitude_m > GAIN_RULE_FLOOR_M && gain > NIGHTLY_GAIN_M) {
    out.push({
      tone: "watch",
      text: `You sleep ${m(gain)} higher than last night. Above ${m(GAIN_RULE_FLOOR_M)} the usual guidance is ${NIGHTLY_GAIN_M}m a night, so this one is over it — expect your guide to walk you higher and bring you back down.`,
    });
  } else if (
    d.altitude_m >= AMS_FLOOR_M &&
    (d.sleptAtM == null || d.sleptAtM < AMS_FLOOR_M)
  ) {
    // Either they cross the line tonight, or — on a trek that flies straight
    // in, like Everest Base Camp starting at Phakding, 2,610m — they were
    // already over it on day one. The first version only fired on a crossing
    // and so said nothing at all on exactly the routes that begin high.
    out.push({
      tone: "watch",
      text:
        d.sleptAtM == null
          ? `This trek starts above ${m(AMS_FLOOR_M)}, where altitude already matters. Drink more than you want to from the first day and tell your guide about any headache.`
          : `Tonight is the first night above ${m(AMS_FLOOR_M)}, where altitude starts to matter. Drink more than you want to and tell your guide about any headache.`,
    });
  } else if (d.down >= 800 && d.sleptAtM != null && d.sleptAtM >= GAIN_RULE_FLOOR_M) {
    out.push({
      tone: "relief",
      text: `${m(d.down)} of descent. Thicker air, warmer nights, and the day most people find they sleep properly again.`,
    });
  }

  return out.slice(0, 2);
}

/** The highest sleeping altitude on a route. */
export function routeHigh(stops: Array<{ altitude_m: number }>): number | null {
  if (!stops.length) return null;
  return stops.reduce((hi, s) => Math.max(hi, s.altitude_m), 0);
}
