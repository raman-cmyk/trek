/**
 * Choosing the days you want to walk.
 *
 * The founder's ask: "I as a client should be able to select the dates I want
 * to go on a trek before clicking request to book, so I can have a visual
 * representation on the trek's timeline."
 *
 * A dropdown of start dates hides the thing that actually matters. A twelve-
 * day trek starting on the 20th runs to the 1st of next month, and whether
 * the guide is free on the 27th is not something a list of start dates can
 * show you. Worse, nothing stopped you asking for a span with a booked day in
 * the middle — the request went in, and it failed days later when the guide
 * pressed accept and the calendar refused.
 *
 * So the rules live here, testable without a calendar grid: what a span is,
 * whether it is clear, and which days a trek of this length can actually
 * start on.
 */

import { addDays } from "~/lib/browse";

/** Every day of a trek that starts on `start` and runs `days` days. */
export function spanDays(start: string, days: number): string[] {
  const n = Math.max(1, Math.floor(days || 1));
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(addDays(start, i));
  return out;
}

/** The last day you are still walking — not the day after. */
export function spanEnd(start: string, days: number): string {
  return addDays(start, Math.max(1, Math.floor(days || 1)) - 1);
}

/** Every day between two dates, inclusive. The order you clicked does not matter. */
export function rangeDays(a: string, b: string): string[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * The first day of this span the guide is not free for, or null if it is clear.
 *
 * Named for what the trekker needs to be told. "Not available" is useless;
 * "Pemba is busy on 27 Sep" is something you can work around.
 */
export function firstTakenDay(
  start: string,
  days: number,
  openDays: Iterable<string>,
): string | null {
  const open = openDays instanceof Set ? openDays : new Set(openDays);
  for (const day of spanDays(start, days)) {
    if (!open.has(day)) return day;
  }
  return null;
}

/** Can a trek of this length start here and run clear to the end? */
export function canStart(start: string, days: number, openDays: Iterable<string>): boolean {
  return firstTakenDay(start, days, openDays) === null;
}

/**
 * The days a trek of this length can actually begin on.
 *
 * Not the same as "days the guide is free": the 30th can be free and still be
 * no use as the start of a twelve-day walk. Offering it as a choice and then
 * refusing the request is the kind of thing that makes people give up.
 */
export function startableDays(openDays: string[], days: number): string[] {
  const open = new Set(openDays);
  return [...openDays].sort().filter((d) => canStart(d, days, open));
}

/** How a span reads to a person: "20 – 31 Aug", "28 Sep – 9 Oct", "4 Jan 2027". */
export function formatSpan(start: string, end: string, now = new Date()): string {
  if (!start) return "";
  const a = day(start);
  const b = end && end !== start ? day(end) : null;
  const thisYear = a.getUTCFullYear() === now.getUTCFullYear();
  const year = (d: Date) => (d.getUTCFullYear() === now.getUTCFullYear() ? "" : ` ${d.getUTCFullYear()}`);

  if (!b) return `${a.getUTCDate()} ${mon(a)}${year(a)}`;
  // Same month and year: one month name is enough — "20 – 31 Aug".
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()} – ${b.getUTCDate()} ${mon(b)}${year(b)}`;
  }
  const left = `${a.getUTCDate()} ${mon(a)}${thisYear ? "" : year(a)}`;
  return `${left} – ${b.getUTCDate()} ${mon(b)}${year(b)}`;
}

/** "12 days", and "1 day" rather than "1 days". */
export function daysLabel(n: number): string {
  const d = Math.max(1, Math.floor(n || 1));
  return `${d} ${d === 1 ? "day" : "days"}`;
}

function day(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

function mon(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}
