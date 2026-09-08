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
