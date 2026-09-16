/**
 * How a journey reads, decided from the trek itself.
 *
 * A fifteen-day journal rendered as fifteen identical blocks — numeral,
 * title, paragraph, photograph — is a filing cabinet, not a story. The
 * variety has to come from somewhere, and the one thing we can trust on this
 * page is the altitude the guide wrote down. So the shape of the walk decides
 * the shape of the page: where the chapters break, which days get a big
 * picture, and where a reader is far enough in to be offered the trip.
 *
 * All of it is derived, never random: the same journal always reads the same
 * way, and a journal with no altitudes gets the plain treatment rather than a
 * guess.
 */

/** Any day-shaped row. The journal page's entries satisfy this. */
export interface ReadingDay {
  day_no: number;
  title?: string | null;
  body?: string | null;
  altitude_m?: number | null;
  is_hard_day?: boolean;
  photos?: unknown[] | null;
}

export interface Chapter {
  key: "in" | "up" | "high" | "down";
  title: string;
  /** Inclusive day numbers. */
  from: number;
  to: number;
  /** Indexes into the entries array, inclusive. */
  firstIndex: number;
  lastIndex: number;
}

/** Within this much of the top, a day counts as one of the high days. */
export const HIGH_BAND_M = 400;
/** The walk in ends once a day has taken you this far up the total climb. */
export const WALK_IN_SHARE = 0.45;
/** Below this many days a trek is short enough to read straight through. */
export const MIN_DAYS_FOR_CHAPTERS = 6;

/**
 * Altitudes with the gaps filled in.
 *
 * A day the guide left blank is not a day at sea level — you slept where you
 * slept. Carrying the last known figure forward keeps the index of every
 * altitude aligned with the index of its day, which is what the boundary
 * search below depends on.
 */
function carried(days: ReadingDay[]): (number | null)[] {
  const out: (number | null)[] = [];
  let last: number | null = null;
  for (const d of days) {
    const a = typeof d.altitude_m === "number" && Number.isFinite(d.altitude_m) ? d.altitude_m : null;
    if (a != null) last = a;
    out.push(last);
  }
  // A leading run of blanks takes the first figure we do know, backwards.
  const firstKnown = out.find((a) => a != null) ?? null;
  return out.map((a) => a ?? firstKnown);
}

/**
 * The trek in three or four chapters, or nothing at all.
 *
 * Nothing at all is a real answer: a four-day walk, a single post, or a
 * journal with no altitudes recorded has no shape to break on, and an
 * invented chapter heading would be worse than none.
 */
export function chaptersOf(days: ReadingDay[]): Chapter[] {
  if (days.length < MIN_DAYS_FOR_CHAPTERS) return [];
  const alts = carried(days);
  if (alts.some((a) => a == null)) return [];
  const a = alts as number[];

  const top = Math.max(...a);
  const start = a[0];
  const gain = top - start;
  if (gain <= 0) return [];

  const highFrom = a.findIndex((v) => v >= top - HIGH_BAND_M);
  let highTo = highFrom;
  for (let i = a.length - 1; i > highFrom; i--) {
    if (a[i] >= top - HIGH_BAND_M) {
      highTo = i;
      break;
    }
  }
  // The top on day one or two is a different story — a flight in, a peak
  // start. There is no walk in to name, so leave it unchaptered.
  if (highFrom < 2) return [];

  const walkInCeiling = start + WALK_IN_SHARE * gain;
  let walkInTo = -1;
  for (let i = 0; i < highFrom; i++) if (a[i] < walkInCeiling) walkInTo = i;

  const out: Chapter[] = [];
  const push = (key: Chapter["key"], title: string, first: number, last: number) => {
    if (first > last) return;
    out.push({
      key,
      title,
      from: days[first].day_no,
      to: days[last].day_no,
      firstIndex: first,
      lastIndex: last,
    });
  };

  push("in", "The walk in", 0, walkInTo);
  push("up", "Going higher", walkInTo + 1, highFrom - 1);
  push("high", highFrom === highTo ? "The high day" : "The high days", highFrom, highTo);
  push("down", "The way down", highTo + 1, days.length - 1);

  // Two chapters is a heading and a heading, not a structure.
  return out.length >= 3 ? out : [];
}

export type DayShape = "feature" | "split" | "standard";

/** A short day beside its one photograph rather than above it. */
export const SPLIT_MAX_BODY = 200;

/**
 * What this day looks like.
 *
 * - `feature`  the day that earns a big picture: the hard day, the highest
 *              day, and the day that opens a chapter.
 * - `split`    a short note with a single photograph beside it.
 * - `standard` words, then the frames underneath.
 */
export function dayShape(
  day: ReadingDay,
  ctx: { isPeak: boolean; opensChapter: boolean },
): DayShape {
  const photos = day.photos?.length ?? 0;
  if (photos === 0) return "standard";
  if (ctx.isPeak || day.is_hard_day || ctx.opensChapter) return "feature";
  if (photos === 1 && (day.body ?? "").trim().length <= SPLIT_MAX_BODY) return "split";
  return "standard";
}

/**
 * Which day is the highest — the one the whole trek bends around.
 *
 * Ties go to the first, because the first time you stand that high is the
 * one you remember.
 */
export function peakIndex(days: ReadingDay[]): number {
  let best = -1;
  let bestAlt = -Infinity;
  days.forEach((d, i) => {
    const alt = typeof d.altitude_m === "number" && Number.isFinite(d.altitude_m) ? d.altitude_m : null;
    if (alt != null && alt > bestAlt) {
      bestAlt = alt;
      best = i;
    }
  });
  return best;
}

/** Below this many days, one offer at the foot of the page is enough. */
export const MIN_DAYS_FOR_MID_CTA = 8;

/**
 * The day to put the trip offer after.
 *
 * A reader who has got through the climb has told us something; the offer
 * belongs there and not only at the end, eleven thousand pixels down. Where
 * there are chapters it sits in a chapter's pause rather than interrupting
 * one.
 */
export function midCtaAfterDay(days: ReadingDay[], chapters: Chapter[]): number | null {
  if (days.length < MIN_DAYS_FOR_MID_CTA) return null;
  if (chapters.length >= 3) {
    const at = Math.floor(chapters.length / 2) - 1;
    return chapters[Math.max(0, at)].to;
  }
  return days[Math.floor(days.length / 2) - 1].day_no;
}
