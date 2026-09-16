/**
 * Bikram Sambat, and back.
 *
 * A Nepali trekking licence prints its expiry in BS. The form asked for
 * `type="date"`, which on an Android browser is a Gregorian dd/mm/yyyy
 * spinner — so a guide reading 2085-03-15 off their own card has to convert
 * it in their head before they can type it, and a guide who does not realise
 * the box wants AD types the BS year and we store a licence that expires in
 * 2085 AD. Sixty years late, and nothing catches it.
 *
 * So: enter either, store AD.
 *
 * The month lengths are data, not arithmetic — the BS calendar's months run
 * 29 to 32 days on a schedule fixed by observation, with no formula. The
 * table below was GENERATED from `nepali-date-converter`, whose output was
 * first checked against four year-boundary dates known independently, and
 * then embedded here rather than depended on at runtime so the worker bundle
 * does not carry a date library.
 *
 * It was typed by hand first, and that version drifted two days by 2080 —
 * which is precisely the failure this module exists to prevent, caught only
 * because the anchors are tests. Do not edit a row by hand; regenerate it.
 *
 * Outside the table we refuse rather than guess: a wrong licence date is
 * worse than asking somebody to use AD.
 */

/** Days in each of the twelve months, by BS year. */
const MONTH_DAYS: Record<number, number[]> = {
  2070: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30], // 365
  2071: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 365
  2072: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 365
  2073: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 366
  2074: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 365
  2075: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 365
  2076: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 365
  2077: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 366
  2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 365
  2079: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 365
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 365
  2081: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 366
  2082: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 365
  2083: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 365
  2084: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 366
  2085: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 365
  2086: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 365
  2087: [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30], // 366
  2088: [30, 31, 32, 32, 30, 31, 30, 30, 29, 30, 30, 30], // 365
  2089: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30], // 365
};

/** Baisakh 1 of the first year in the table, in AD. Verified in the tests. */
const ANCHOR_BS_YEAR = 2070;
const ANCHOR_AD = Date.UTC(2013, 3, 14); // 14 April 2013

const DAY = 86_400_000;

export const BS_MIN_YEAR = ANCHOR_BS_YEAR;
export const BS_MAX_YEAR = Math.max(...Object.keys(MONTH_DAYS).map(Number));

export interface BsDate {
  year: number;
  /** 1–12, Baisakh first. */
  month: number;
  day: number;
}

export const BS_MONTHS = [
  "Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra",
] as const;

/** Whether the table covers this year at all. */
export function bsYearKnown(year: number): boolean {
  return Object.prototype.hasOwnProperty.call(MONTH_DAYS, year);
}

export function bsMonthLength(year: number, month: number): number | null {
  if (!bsYearKnown(year) || month < 1 || month > 12) return null;
  return MONTH_DAYS[year][month - 1];
}

/**
 * BS → AD, as an ISO `yyyy-mm-dd`, or null when we cannot be sure.
 *
 * Null is a real answer: the caller asks for AD instead rather than storing
 * a date computed from a year the table does not have.
 */
export function bsToAd(bs: BsDate): string | null {
  if (!bsYearKnown(bs.year)) return null;
  const len = bsMonthLength(bs.year, bs.month);
  if (len == null || bs.day < 1 || bs.day > len) return null;

  let days = 0;
  for (let y = ANCHOR_BS_YEAR; y < bs.year; y++) {
    if (!bsYearKnown(y)) return null;
    days += MONTH_DAYS[y].reduce((a, b) => a + b, 0);
  }
  for (let m = 1; m < bs.month; m++) days += MONTH_DAYS[bs.year][m - 1];
  days += bs.day - 1;

  return new Date(ANCHOR_AD + days * DAY).toISOString().slice(0, 10);
}

/** AD → BS, or null when the date falls outside the table. */
export function adToBs(iso: string): BsDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // The shape matching is not the value being real: "2024-13-40" parsed, and
  // Date.UTC rolled it forward into a plausible-looking BS date.
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo - 1, d);
  if (!Number.isFinite(t)) return null;
  // And a rolled-over date is not the date asked for.
  const back = new Date(t);
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  let days = Math.round((t - ANCHOR_AD) / DAY);
  if (days < 0) return null;

  let year = ANCHOR_BS_YEAR;
  while (bsYearKnown(year)) {
    const inYear = MONTH_DAYS[year].reduce((a, b) => a + b, 0);
    if (days < inYear) break;
    days -= inYear;
    year++;
  }
  if (!bsYearKnown(year)) return null;

  let month = 1;
  while (month <= 12 && days >= MONTH_DAYS[year][month - 1]) {
    days -= MONTH_DAYS[year][month - 1];
    month++;
  }
  if (month > 12) return null;
  return { year, month, day: days + 1 };
}

/** "15 Ashadh 2085" — how a guide reads their own card. */
export function formatBs(bs: BsDate): string {
  return `${bs.day} ${BS_MONTHS[bs.month - 1]} ${bs.year}`;
}

/**
 * A licence expiry, sanity-checked.
 *
 * Catches the mistake this whole module exists for: a BS year typed into an
 * AD box. 2085 as an AD year is sixty years out, and no licence is valid for
 * sixty years — so we can say so instead of storing it.
 */
export function licenceExpiryProblem(iso: string, today = new Date()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!m) return "Pick the date printed on your licence.";
  const year = Number(m[1]);
  const bsNow = adToBs(today.toISOString().slice(0, 10));
  // A year in BS range, entered as AD, is the classic slip.
  if (year >= BS_MIN_YEAR) {
    return bsNow
      ? `That looks like a Bikram Sambat year. Switch to BS, or enter the AD date — this year is ${today.getUTCFullYear()} AD, ${bsNow.year} BS.`
      : "That looks like a Bikram Sambat year — switch the toggle to BS.";
  }
  const when = Date.parse(`${iso}T00:00:00Z`);
  if (when < today.getTime()) return "This licence has already expired.";
  if (year > today.getUTCFullYear() + 15) {
    return "That is more than fifteen years away — check the year.";
  }
  return null;
}
