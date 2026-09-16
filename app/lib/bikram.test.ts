import { describe, expect, it } from "vitest";
import {
  adToBs,
  bsMonthLength,
  bsToAd,
  bsYearKnown,
  BS_MAX_YEAR,
  BS_MIN_YEAR,
  formatBs,
  licenceExpiryProblem,
} from "./bikram";

describe("the anchors", () => {
  // Independently known mappings. If the month table drifts, these break —
  // which is the whole reason they are here rather than a comment.
  it("Baisakh 1, 2070 is 14 April 2013", () => {
    expect(bsToAd({ year: 2070, month: 1, day: 1 })).toBe("2013-04-14");
  });

  it("Baisakh 1, 2080 is 14 April 2023", () => {
    expect(bsToAd({ year: 2080, month: 1, day: 1 })).toBe("2023-04-14");
  });

  it("Baisakh 1, 2081 is 13 April 2024", () => {
    expect(bsToAd({ year: 2081, month: 1, day: 1 })).toBe("2024-04-13");
  });

  it("Baisakh 1, 2082 is 14 April 2025", () => {
    expect(bsToAd({ year: 2082, month: 1, day: 1 })).toBe("2025-04-14");
  });

  it("converts a mid-year date, not only a year boundary", () => {
    // A year boundary can line up while every month inside it is wrong, which
    // is how the hand-typed table passed its first two anchors.
    expect(bsToAd({ year: 2085, month: 3, day: 15 })).toBe("2028-06-29");
  });

  it("gives every year in the table 365 or 366 days", () => {
    for (let y = BS_MIN_YEAR; y < BS_MAX_YEAR; y++) {
      const start = Date.parse(bsToAd({ year: y, month: 1, day: 1 })!);
      const next = Date.parse(bsToAd({ year: y + 1, month: 1, day: 1 })!);
      const days = Math.round((next - start) / 86_400_000);
      expect([365, 366], `BS ${y} is ${days} days`).toContain(days);
    }
  });
});

describe("round trips", () => {
  it("returns every date in the table to itself", () => {
    for (let y = BS_MIN_YEAR; y <= BS_MAX_YEAR; y++) {
      for (let m = 1; m <= 12; m++) {
        for (const d of [1, 15, bsMonthLength(y, m)!]) {
          const ad = bsToAd({ year: y, month: m, day: d });
          expect(ad, `${y}-${m}-${d}`).toBeTruthy();
          expect(adToBs(ad!), `${y}-${m}-${d}`).toEqual({ year: y, month: m, day: d });
        }
      }
    }
  });

  it("moves one day at a time without skipping or repeating", () => {
    let prev = bsToAd({ year: 2081, month: 1, day: 1 })!;
    for (let d = 2; d <= 31; d++) {
      const next = bsToAd({ year: 2081, month: 1, day: d })!;
      expect(Date.parse(next) - Date.parse(prev)).toBe(86_400_000);
      prev = next;
    }
  });
});

describe("refusing rather than guessing", () => {
  it("knows which years it has", () => {
    expect(bsYearKnown(BS_MIN_YEAR)).toBe(true);
    expect(bsYearKnown(BS_MAX_YEAR)).toBe(true);
    expect(bsYearKnown(2069)).toBe(false);
    expect(bsYearKnown(2099)).toBe(false);
  });

  it("returns null outside the table instead of a computed guess", () => {
    expect(bsToAd({ year: 2099, month: 1, day: 1 })).toBeNull();
    expect(bsToAd({ year: 2069, month: 12, day: 30 })).toBeNull();
    expect(adToBs("1990-01-01")).toBeNull();
  });

  it("rejects a day its month does not have", () => {
    // Poush 2080 has 29 days.
    expect(bsMonthLength(2080, 9)).toBe(29);
    expect(bsToAd({ year: 2080, month: 9, day: 30 })).toBeNull();
  });

  it("rejects a month outside one to twelve", () => {
    expect(bsToAd({ year: 2080, month: 13, day: 1 })).toBeNull();
    expect(bsToAd({ year: 2080, month: 0, day: 1 })).toBeNull();
  });

  it("ignores rubbish handed to adToBs", () => {
    for (const bad of ["", "not a date", "2024-13-40", "14/04/2024"]) {
      expect(adToBs(bad), bad).toBeNull();
    }
  });
});

describe("formatBs", () => {
  it("reads the way the card does", () => {
    expect(formatBs({ year: 2085, month: 3, day: 15 })).toBe("15 Ashadh 2085");
  });
});

describe("licenceExpiryProblem", () => {
  const today = new Date("2026-09-16T00:00:00Z");

  it("accepts a real future AD expiry", () => {
    expect(licenceExpiryProblem("2029-05-01", today)).toBeNull();
  });

  it("catches a Bikram year typed into the AD box", () => {
    // The mistake the whole module exists for: sixty years out, and nothing
    // else would have caught it.
    const p = licenceExpiryProblem("2085-03-15", today);
    expect(p).toBeTruthy();
    expect(p).toContain("Bikram Sambat");
    expect(p).toContain("2083");
  });

  it("says so when the licence has already run out", () => {
    expect(licenceExpiryProblem("2024-01-01", today)).toContain("already expired");
  });

  it("queries a date absurdly far out", () => {
    expect(licenceExpiryProblem("2050-01-01", today)).toContain("fifteen years");
  });

  it("asks plainly when the box is empty", () => {
    expect(licenceExpiryProblem("", today)).toContain("printed on your licence");
  });
});
