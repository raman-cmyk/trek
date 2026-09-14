/**
 * When a guide is free, and when a particular trip can start.
 *
 * These are not the same question, and answering them in two places with two
 * private copies of the arithmetic is why the guide's profile advertised 76
 * open days while the trek page offered a handful of dates and no calendar at
 * all. A 14-day trek needs fourteen consecutive open days, so most of a
 * guide's free days cannot start it — which is worth showing rather than
 * quietly filtering away.
 *
 * All dates are ISO day strings in UTC. Pure, so the profile and the trip page
 * cannot drift apart again.
 */

/** A trip cannot start tomorrow: the guide has to read the request first. */
export const LEAD_DAYS = 3;

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The days this trip could actually begin: far enough ahead, and with enough
 * consecutive open days after them to finish.
 */
export function bookableStartDays(
  openDays: string[],
  span: number,
  todayIso: string,
): string[] {
  const minStart = addDays(todayIso, LEAD_DAYS);
  const open = new Set(openDays);
  return openDays.filter((d) => {
    if (d < minStart) return false;
    if (span <= 1) return true;
    for (let i = 1; i < span; i++) {
      if (!open.has(addDays(d, i))) return false;
    }
    return true;
  });
}

/**
 * The first stretch of `run` consecutive open days, as "8–10 Sep".
 *
 * What the rail means by "next free": not the next single day, which might be
 * a Tuesday with bookings either side, but the next window somebody could
 * actually walk in.
 */
export function firstRun(openDays: string[], run: number): string | null {
  const open = new Set(openDays);
  for (const start of openDays) {
    let ok = true;
    for (let i = 1; i < run; i++) {
      if (!open.has(addDays(start, i))) {
        ok = false;
        break;
      }
    }
    if (ok) return `${start}|${addDays(start, run - 1)}`;
  }
  return null;
}

/** How many of the days fall within `months` of today. */
export function daysWithinMonths(days: string[], todayIso: string, months: number): number {
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  const until = d.toISOString().slice(0, 10);
  return days.filter((x) => x >= todayIso && x <= until).length;
}

export interface AvailabilitySummary {
  /** "2026-09-08|2026-09-10", or null when there is no such window. */
  nextRun: string | null;
  /** The first day this trip could start. */
  nextStart: string | null;
  /** Open days in the next three months. */
  openSoon: number;
  /** Of those, how many could start this trip. */
  startableSoon: number;
}

export function availabilitySummary(args: {
  openDays: string[];
  bookableDays: string[];
  today: string;
  runLength?: number;
}): AvailabilitySummary {
  return {
    nextRun: firstRun(args.openDays, args.runLength ?? 3),
    nextStart: args.bookableDays[0] ?? null,
    openSoon: daysWithinMonths(args.openDays, args.today, 3),
    startableSoon: daysWithinMonths(args.bookableDays, args.today, 3),
  };
}

/**
 * Why a trip cannot start on a day the guide is free — the sentence that
 * explains the gap between the two numbers.
 */
export function startableNote(span: number, openSoon: number, startableSoon: number): string | null {
  if (span <= 1 || openSoon === 0) return null;
  if (startableSoon === openSoon) return null;
  return `This trip takes ${span} days, so it can only begin where ${span} free days run together — ${startableSoon} of the ${openSoon} free days qualify.`;
}
