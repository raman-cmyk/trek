/**
 * A month, as a grid.
 *
 * The hero asked "setting off" with a bare date input, which a browser renders
 * in its own locale — so a trekker in Berlin and a guide in Kathmandu were
 * shown mm/dd/yyyy and dd/mm/yyyy respectively, both had to type, and neither
 * could see that the 12th is a Saturday. This is the arithmetic behind a real
 * calendar: seven columns, six rows, the days either side greyed, and a range
 * you can walk forward through.
 *
 * Every date here is an ISO day string ("2026-09-05") in UTC. No Date objects
 * cross the boundary, because a picker that shifts by a day in Kathmandu
 * (UTC+5:45) is worse than no picker.
 */

export const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** How far ahead a trekker may pick. A season and a half, so next autumn is reachable. */
export const MONTHS_AHEAD = 18;

export interface DayCell {
  /** The ISO date. Always present — the greyed days either side are real days. */
  date: string;
  /** The number to print. */
  day: number;
  /** Belongs to the month either side of the one being shown. */
  outside: boolean;
  /** Before the first selectable day, so it cannot be chosen. */
  disabled: boolean;
  /** Today, whether or not it can be chosen. */
  isToday: boolean;
}

export interface MonthKey {
  year: number;
  month: number; // 1–12, because every other date string in this app is 1-based
}

export function toIso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseIso(iso: string): MonthKey & { day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 = Sunday, to match the column order people expect. */
export function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMonths(key: MonthKey, n: number): MonthKey {
  const zero = key.month - 1 + n;
  return { year: key.year + Math.floor(zero / 12), month: ((zero % 12) + 12) % 12 + 1 };
}

export function monthOf(iso: string): MonthKey {
  const p = parseIso(iso);
  return p ? { year: p.year, month: p.month } : { year: 1970, month: 1 };
}

export function monthLabel(key: MonthKey): string {
  return `${MONTH_NAMES[key.month - 1]} ${key.year}`;
}

export function sameMonth(a: MonthKey, b: MonthKey): boolean {
  return a.year === b.year && a.month === b.month;
}

/** Month ordering, for "is this month before the one we may show?" */
export function monthIndex(key: MonthKey): number {
  return key.year * 12 + (key.month - 1);
}

/**
 * The first day a trekker may choose: tomorrow.
 *
 * Not today. Every trip on this platform starts with a guide reading a request
 * and answering it, which takes longer than the rest of today.
 */
export function firstSelectable(today: string): string {
  return addDaysIso(today, 1);
}

/** The last day the picker will walk to. */
export function lastSelectable(today: string): string {
  const { year, month } = addMonths(monthOf(today), MONTHS_AHEAD);
  return toIso(year, month, daysInMonth(year, month));
}

/**
 * Six weeks of seven days, always — so the grid does not change height as you
 * walk through the months, which is the thing that makes a picker feel cheap.
 * The days either side of the month are real and greyed, exactly as every
 * desktop calendar shows them.
 */
export function monthGrid(
  key: MonthKey,
  opts: { today: string; min?: string; max?: string },
): DayCell[][] {
  const min = opts.min ?? firstSelectable(opts.today);
  const max = opts.max ?? lastSelectable(opts.today);
  const first = toIso(key.year, key.month, 1);
  const lead = weekdayOf(first);
  const start = addDaysIso(first, -lead);

  const weeks: DayCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDaysIso(start, w * 7 + d);
      const p = parseIso(date)!;
      row.push({
        date,
        day: p.day,
        outside: p.month !== key.month || p.year !== key.year,
        disabled: date < min || date > max,
        isToday: date === opts.today,
      });
    }
    weeks.push(row);
  }
  return weeks;
}

/** Can the picker step back from here? */
export function canGoBack(shown: MonthKey, today: string): boolean {
  return monthIndex(shown) > monthIndex(monthOf(firstSelectable(today)));
}

export function canGoForward(shown: MonthKey, today: string): boolean {
  return monthIndex(shown) < monthIndex(monthOf(lastSelectable(today)));
}

/**
 * The month to open on: the chosen date's, or the first one with a selectable
 * day in it. Opening on a month whose every day is greyed is a dead end.
 */
export function initialMonth(selected: string | null, today: string): MonthKey {
  if (selected && parseIso(selected)) return monthOf(selected);
  return monthOf(firstSelectable(today));
}

/** "Sat 5 Sep 2026" — unambiguous in any locale, which mm/dd/yyyy is not. */
export function longDayLabel(iso: string): string {
  const p = parseIso(iso);
  if (!p) return "";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekdayOf(iso)];
  return `${wd} ${p.day} ${MONTH_NAMES[p.month - 1].slice(0, 3)} ${p.year}`;
}
