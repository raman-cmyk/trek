/**
 * The daily safety update, and which day of the trek it is.
 *
 * A guide's home screen said "On the trail — day 34" of a fourteen-day trek.
 * The number was the days since the start date and nothing else: no end, no
 * total, no notion that the trek was over. The booking had finished on the
 * 20th of August and nobody had closed it, so the counter kept going and the
 * app kept asking a man in Kathmandu to confirm he was safe on the mountain.
 *
 * A trek has a first day and a last day. Day 1 is the day it starts, the last
 * day is the day it ends, and outside those days there is no check-in to make
 * — which is the other half of the fix: the ask exists only while the trek
 * does.
 */

export type TrekWindow = "before" | "on" | "after";

export interface TrekDay {
  /** 1 on the start date, `total` on the end date. Clamped to both ends. */
  day: number;
  /** How many days the trek runs, inclusive of both ends. */
  total: number;
  where: TrekWindow;
  /** Days until it starts (0 once it has). */
  daysUntilStart: number;
  /** True on the last day, which is the one worth saying out loud. */
  lastDay: boolean;
}

const DAY = 86_400_000;

function midnight(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

/**
 * Where in the trek today is.
 *
 * Dates, not timestamps: a trek's day changes at midnight where the guide is,
 * not at some hour of UTC, and everything we store for a trip is a plain date
 * already.
 */
export function trekDay(startIso: string, endIso: string, todayIso: string): TrekDay {
  const start = midnight(startIso);
  const end = Math.max(midnight(endIso), start);
  const today = midnight(todayIso);
  const total = Math.round((end - start) / DAY) + 1;
  const raw = Math.round((today - start) / DAY) + 1;

  const where: TrekWindow = raw < 1 ? "before" : raw > total ? "after" : "on";
  const day = Math.min(Math.max(raw, 1), total);
  return {
    day,
    total,
    where,
    daysUntilStart: Math.max(0, 1 - raw),
    lastDay: where === "on" && day === total,
  };
}

/**
 * Is there a check-in to make today?
 *
 * Only during the trek. Before it there is nothing to report, and after it the
 * guide is home — an app that keeps asking is an app whose asking means
 * nothing, which is the state the missed-check-in alert was quietly in.
 */
export function checkinIsDue(
  window: TrekDay,
  alreadyCheckedIn: boolean,
): boolean {
  return window.where === "on" && !alreadyCheckedIn;
}

/**
 * A trek whose last day has passed but which nobody has closed.
 *
 * This is what produced "day 34": bookings stay `active` until somebody says
 * otherwise, and the trekker is the only person who was ever asked. The guide
 * is standing right there and knows first.
 */
export function needsClosing(window: TrekDay, status: string): boolean {
  return status === "active" && window.where === "after";
}

/** "Day 6 of 14" — and on the last one, that it is the last one. */
export function dayLabel(window: TrekDay): string {
  if (window.where === "before") {
    return window.daysUntilStart === 1
      ? "Starts tomorrow"
      : `Starts in ${window.daysUntilStart} days`;
  }
  if (window.where === "after") return "Finished";
  return window.lastDay ? `Last day — day ${window.day}` : `Day ${window.day} of ${window.total}`;
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The days of this trek that have no update yet.
 *
 * Guides walk out of signal for days at a time — that is the normal condition
 * of the job, not a failure — so the check-in cannot be a thing that only
 * exists on the day itself. It is a record kept for due diligence, and a
 * record can be completed afterwards. These are the days still missing from
 * it: from the first day of the trek up to today, or to the last day once the
 * trek is over, minus whatever has already been sent.
 *
 * Nothing in the future, because a guide cannot report a day that has not
 * happened.
 */
export function missingDays(
  startIso: string,
  endIso: string,
  todayIso: string,
  done: string[],
): string[] {
  const start = midnight(startIso);
  const end = Math.max(midnight(endIso), start);
  const today = midnight(todayIso);
  const last = Math.min(end, today);
  if (last < start) return [];

  const sent = new Set(done.map((d) => d.slice(0, 10)));
  const out: string[] = [];
  for (let t = start; t <= last; t += DAY) {
    const d = iso(t);
    if (!sent.has(d)) out.push(d);
  }
  return out;
}

/**
 * May this day be recorded at all?
 *
 * Inside the trek, and not in the future. Deliberately allows a day that has
 * already passed, which is the whole point: the guide is filling in the week
 * they spent above the treeline.
 */
export function canRecord(
  startIso: string,
  endIso: string,
  todayIso: string,
  dayIso: string,
): boolean {
  const day = midnight(dayIso);
  const start = midnight(startIso);
  const end = Math.max(midnight(endIso), start);
  return day >= start && day <= end && day <= midnight(todayIso);
}

/**
 * How many days in a row, ending with the most recent reportable one, have
 * had no word at all.
 *
 * One silent day is ordinary: the guide walked past the last cell tower
 * before lunch and will fill it in tonight. Two in a row is the point where
 * the office stops assuming and picks up a phone — which is the whole reason
 * this counts a RUN rather than a total. A trek missing days 2 and 9 has been
 * out of signal twice and is fine; a trek missing days 8 and 9 has not been
 * heard from since day seven.
 *
 * Counted backwards from today (or the last day, once the trek is over), so a
 * check-in filled in late closes the run the moment it arrives.
 */
export function missedRunEndingAt(
  startIso: string,
  endIso: string,
  todayIso: string,
  done: string[],
): number {
  const start = midnight(startIso);
  const end = Math.max(midnight(endIso), start);
  const last = Math.min(end, midnight(todayIso));
  if (last < start) return 0;

  const sent = new Set(done.map((d) => d.slice(0, 10)));
  let run = 0;
  for (let t = last; t >= start; t -= DAY) {
    if (sent.has(iso(t))) break;
    run++;
  }
  return run;
}

/** Two days of silence: the office calls, rather than waits (docs/01 F7). */
export const WELFARE_CHECK_AFTER_DAYS = 2;

export function needsWelfareCheck(missedRun: number): boolean {
  return missedRun >= WELFARE_CHECK_AFTER_DAYS;
}

/** Sent after the day it describes — worth showing, and not worth scolding. */
export function wasLate(dayIso: string, receivedAtIso: string): boolean {
  return midnight(receivedAtIso) > midnight(dayIso);
}
