import { describe, it, expect } from "vitest";
import {
  MONTHS_AHEAD,
  WEEKDAY_LABELS,
  addMonths,
  canGoBack,
  canGoForward,
  daysInMonth,
  firstSelectable,
  initialMonth,
  lastSelectable,
  longDayLabel,
  monthGrid,
  monthLabel,
  parseIso,
  weekdayOf,
} from "./calendar";

const TODAY = "2026-09-05"; // a Saturday, as in the screenshot

describe("the month itself", () => {
  it("knows how long each one is, leap years included", () => {
    expect(daysInMonth(2026, 9)).toBe(30);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
  it("walks forward and back across the year boundary", () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 9 }, 18)).toEqual({ year: 2028, month: 3 });
  });
  it("names itself in full", () => {
    expect(monthLabel({ year: 2026, month: 9 })).toBe("September 2026");
  });
  it("puts Sunday first, as the grid does", () => {
    expect(WEEKDAY_LABELS[0]).toBe("Su");
    expect(WEEKDAY_LABELS).toHaveLength(7);
    expect(weekdayOf("2026-09-05")).toBe(6); // Saturday
    expect(weekdayOf("2026-09-06")).toBe(0); // Sunday
  });
});

describe("what a trekker may choose", () => {
  it("starts tomorrow, never today", () => {
    expect(firstSelectable(TODAY)).toBe("2026-09-06");
  });
  it("runs 18 months out, to the end of that month", () => {
    expect(MONTHS_AHEAD).toBe(18);
    expect(lastSelectable(TODAY)).toBe("2028-03-31");
  });
});

describe("the grid", () => {
  const weeks = monthGrid({ year: 2026, month: 9 }, { today: TODAY });

  it("is always six rows of seven, so it never changes height", () => {
    expect(weeks).toHaveLength(6);
    for (const w of weeks) expect(w).toHaveLength(7);
    for (const month of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(monthGrid({ year: 2026, month }, { today: TODAY })).toHaveLength(6);
    }
  });

  it("starts on the Sunday before the 1st", () => {
    // September 2026 begins on a Tuesday, so the row opens with 30 and 31 of
    // August — greyed, exactly as the screenshot shows.
    expect(weeks[0].map((c) => c.day)).toEqual([30, 31, 1, 2, 3, 4, 5]);
    expect(weeks[0][0].outside).toBe(true);
    expect(weeks[0][1].outside).toBe(true);
    expect(weeks[0][2].outside).toBe(false);
  });

  it("holds every day of the month, once", () => {
    const inside = weeks.flat().filter((c) => !c.outside);
    expect(inside).toHaveLength(30);
    expect(inside.map((c) => c.day)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("greys out everything before tomorrow", () => {
    const cells = weeks.flat();
    const today = cells.find((c) => c.date === TODAY)!;
    expect(today.isToday).toBe(true);
    expect(today.disabled).toBe(true);
    expect(cells.find((c) => c.date === "2026-09-06")!.disabled).toBe(false);
    expect(cells.find((c) => c.date === "2026-09-04")!.disabled).toBe(true);
  });

  it("greys out everything past the end of the range", () => {
    const far = monthGrid({ year: 2028, month: 3 }, { today: TODAY }).flat();
    expect(far.find((c) => c.date === "2028-03-31")!.disabled).toBe(false);
    expect(far.find((c) => c.date === "2028-04-01")!.disabled).toBe(true);
  });

  it("has no gap or repeat where the months meet", () => {
    const sep = monthGrid({ year: 2026, month: 9 }, { today: TODAY }).flat();
    const oct = monthGrid({ year: 2026, month: 10 }, { today: TODAY }).flat();
    const lastSep = sep.filter((c) => !c.outside).at(-1)!;
    const firstOct = oct.filter((c) => !c.outside)[0]!;
    expect(lastSep.date).toBe("2026-09-30");
    expect(firstOct.date).toBe("2026-10-01");
  });

  it("every cell parses as a real date", () => {
    for (const c of weeks.flat()) expect(parseIso(c.date)).not.toBeNull();
  });
});

describe("walking through the months", () => {
  it("cannot go back before the month tomorrow is in", () => {
    expect(canGoBack({ year: 2026, month: 9 }, TODAY)).toBe(false);
    expect(canGoBack({ year: 2026, month: 10 }, TODAY)).toBe(true);
  });
  it("cannot go past the end of the range", () => {
    expect(canGoForward({ year: 2028, month: 3 }, TODAY)).toBe(false);
    expect(canGoForward({ year: 2028, month: 2 }, TODAY)).toBe(true);
  });
  it("opens on the chosen date's month, or the first usable one", () => {
    expect(initialMonth("2027-04-11", TODAY)).toEqual({ year: 2027, month: 4 });
    expect(initialMonth(null, TODAY)).toEqual({ year: 2026, month: 9 });
    expect(initialMonth("rubbish", TODAY)).toEqual({ year: 2026, month: 9 });
    // Tomorrow is in next month when today is the last of this one.
    expect(initialMonth(null, "2026-09-30")).toEqual({ year: 2026, month: 10 });
  });
});

describe("the date, once chosen", () => {
  it("reads the same way in every country", () => {
    expect(longDayLabel("2026-09-05")).toBe("Sat 5 Sep 2026");
    expect(longDayLabel("2026-12-25")).toBe("Fri 25 Dec 2026");
  });
  it("is nothing when there is nothing", () => {
    expect(longDayLabel("")).toBe("");
    expect(parseIso("2026-02-30")).toBeNull();
    expect(parseIso("2026-13-01")).toBeNull();
  });
});
