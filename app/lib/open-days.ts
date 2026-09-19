/**
 * What "free" means when there is no row saying so.
 *
 * The `availability` table stores what happened to a day, not what a day is.
 * Four things write to it — a guide blocking a stretch, a booking holding
 * days, a deposit confirming them, a cancellation letting them go — and every
 * one of them is a reaction to something. Nothing in the application has ever
 * created a row that simply means "free". The only thing that ever did was
 * the demo seed, which hands each fake guide 271 of them, which is exactly
 * why this looked fine in testing.
 *
 * The two halves of the product then read the silence differently:
 *
 *   - `clashingDays` (booking.server.ts) asks only for held/booked/blocked and
 *     treats everything else as free. Its docblock says so outright.
 *   - Every page that shows or searches guides asked for `status = 'open'` and
 *     considered only the rows that came back, so a day with no row was a day
 *     the guide was busy.
 *
 * The result in production: a verified guide with a live trip had no open days,
 * so his own trek page rendered "No open dates right now" *instead of* the
 * request form, and he was missing from every dated search. Bookable by the
 * server, invisible to every trekker.
 *
 * This module settles it the way the booking server already had: **a day is
 * open unless a row says otherwise**, out to a horizon past which we do not
 * claim to know. Storing 365 rows per guide would have worked too, but it
 * needs a backfill, a rolling job, and a window that runs out in silence —
 * the same bug again, just a year later.
 */

import { addDays } from "~/lib/browse";

/**
 * How far ahead a guide is taken to be free without saying anything.
 *
 * A year. The longest lead time on a real booking so far is 162 days and the
 * furthest start date anyone has asked for is 2027-02-15, so a year covers
 * the demand with room; past it, a guide who has never touched the calendar
 * has not told us anything and we should not answer for them.
 */
export const OPEN_HORIZON_DAYS = 365;

/** The statuses that mean a day is spoken for. Everything else is free. */
export const TAKEN_STATUSES = ["held", "booked", "blocked"] as const;

/** The last day covered by the default-open window. */
export function horizonEnd(today: string): string {
  return addDays(today, OPEN_HORIZON_DAYS);
}

/**
 * The window we will actually answer about: the caller's range, clipped to
 * today at the near end and to the horizon at the far end.
 *
 * Returns null when there is nothing left — a range entirely in the past, or
 * one that starts after the horizon. Callers treat null as "no open days",
 * which is the honest answer for "is this guide free in 2031".
 */
export function clipToHorizon(
  win: { from: string; to: string },
  today: string,
): { from: string; to: string } | null {
  const from = win.from > today ? win.from : today;
  const end = horizonEnd(today);
  const to = win.to < end ? win.to : end;
  return from <= to ? { from, to } : null;
}

/**
 * Every day in the window that nothing has taken.
 *
 * `taken` is the day list from the rows whose status is held, booked or
 * blocked — the query is the inverse of the one this replaces, and returns a
 * few hundred rows where the old one returned thirteen thousand.
 */
export function openDaysIn(
  win: { from: string; to: string },
  taken: Iterable<string>,
  today: string,
): string[] {
  const clipped = clipToHorizon(win, today);
  if (!clipped) return [];
  const busy = taken instanceof Set ? taken : new Set(taken);
  const out: string[] = [];
  for (let d = clipped.from; d <= clipped.to; d = addDays(d, 1)) {
    if (!busy.has(d)) out.push(d);
  }
  return out;
}

/** How many days in the window nothing has taken. Cheaper than listing them. */
export function openDayCount(
  win: { from: string; to: string },
  taken: Iterable<string>,
  today: string,
): number {
  return openDaysIn(win, taken, today).length;
}

/**
 * The longest run of consecutive days in a list.
 *
 * "Free at all?" and "free for a fourteen-day trek?" are the same question
 * asked with a different number, and this is what turns a set of days into an
 * answer for both.
 */
export function longestRun(days: string[]): number {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

/**
 * The longest stretch this guide is free for inside the window.
 *
 * The shortcut matters: with no taken days at all the answer is the whole
 * clipped window, and working that out by building a 365-entry array for each
 * of fifty guides on every search is work for nothing.
 */
export function longestOpenRun(
  win: { from: string; to: string },
  taken: Iterable<string>,
  today: string,
): number {
  const clipped = clipToHorizon(win, today);
  if (!clipped) return 0;
  const busy = taken instanceof Set ? taken : new Set(taken);
  if (busy.size === 0) {
    return Math.round((Date.parse(clipped.to) - Date.parse(clipped.from)) / 86_400_000) + 1;
  }
  return longestRun(openDaysIn(clipped, busy, today));
}

/**
 * The three numbers an ops person wants about a guide's year: how many days
 * they are free, how many are sold, how many they have blocked off.
 *
 * "Open" is the window minus everything else, because there is nothing to
 * count: a guide who has never opened the calendar has no rows at all, and
 * the old version of this reported them as having zero free days, which is
 * the opposite of the truth.
 *
 * `held` counts with `booked` — a held day is a trekker's deposit clock
 * running, not a day anyone else can have.
 */
export function availabilityCounts(
  rows: Array<{ day: string; status: string }>,
  today: string,
): { open: number; booked: number; blocked: number } {
  const win = clipToHorizon({ from: today, to: horizonEnd(today) }, today);
  const size = win
    ? Math.round((Date.parse(win.to) - Date.parse(win.from)) / 86_400_000) + 1
    : 0;
  const inWindow = rows.filter((r) => !!win && r.day >= win.from && r.day <= win.to);
  const taken = new Set(inWindow.map((r) => r.day));
  return {
    open: Math.max(0, size - taken.size),
    booked: inWindow.filter((r) => r.status === "booked" || r.status === "held").length,
    blocked: inWindow.filter((r) => r.status === "blocked").length,
  };
}
