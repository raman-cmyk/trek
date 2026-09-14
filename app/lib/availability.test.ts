import { describe, it, expect } from "vitest";
import {
  LEAD_DAYS,
  availabilitySummary,
  bookableStartDays,
  daysWithinMonths,
  firstRun,
  startableNote,
} from "./availability";

const TODAY = "2026-09-05";
// The 8th to the 12th, then the 20th and 21st.
const OPEN = [
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
  "2026-09-12",
  "2026-09-20",
  "2026-09-21",
];

describe("when a trip can start", () => {
  it("needs a few days' lead time", () => {
    expect(LEAD_DAYS).toBe(3);
    // The 7th would be inside the lead time even if it were open.
    expect(bookableStartDays(["2026-09-06", "2026-09-08"], 1, TODAY)).toEqual(["2026-09-08"]);
  });

  it("a day experience can start on any free day, far enough out", () => {
    expect(bookableStartDays(OPEN, 1, TODAY)).toEqual(OPEN);
  });

  it("a five-day trek needs five days in a row", () => {
    expect(bookableStartDays(OPEN, 5, TODAY)).toEqual(["2026-09-08"]);
  });

  it("a six-day trek cannot start at all on this calendar", () => {
    expect(bookableStartDays(OPEN, 6, TODAY)).toEqual([]);
  });

  it("does not run off the end of a gap", () => {
    expect(bookableStartDays(OPEN, 3, TODAY)).toEqual([
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
    ]);
  });
});

describe("the next free window", () => {
  it("is the first stretch long enough to walk", () => {
    expect(firstRun(OPEN, 3)).toBe("2026-09-08|2026-09-10");
  });
  it("skips a lone day with bookings either side", () => {
    expect(firstRun(["2026-09-08", "2026-09-20", "2026-09-21", "2026-09-22"], 3)).toBe(
      "2026-09-20|2026-09-22",
    );
  });
  it("is nothing when no window is long enough", () => {
    expect(firstRun(["2026-09-08", "2026-09-20"], 3)).toBeNull();
    expect(firstRun([], 3)).toBeNull();
  });
});

describe("how much of the next three months is free", () => {
  it("counts only what falls inside the window", () => {
    expect(daysWithinMonths(OPEN, TODAY, 3)).toBe(7);
    expect(daysWithinMonths([...OPEN, "2027-02-01"], TODAY, 3)).toBe(7);
    expect(daysWithinMonths(["2026-09-04"], TODAY, 3)).toBe(0);
  });
});

describe("the summary both pages read", () => {
  it("answers all four questions at once", () => {
    const s = availabilitySummary({
      openDays: OPEN,
      bookableDays: bookableStartDays(OPEN, 5, TODAY),
      today: TODAY,
    });
    expect(s).toEqual({
      nextRun: "2026-09-08|2026-09-10",
      nextStart: "2026-09-08",
      openSoon: 7,
      startableSoon: 1,
    });
  });
});

describe("explaining the gap between the two numbers", () => {
  it("says why a long trek has fewer start days than free days", () => {
    expect(startableNote(5, 7, 1)).toBe(
      "This trip takes 5 days, so it can only begin where 5 free days run together — 1 of the 7 free days qualify.",
    );
  });
  it("says nothing when there is nothing to explain", () => {
    expect(startableNote(1, 7, 7)).toBeNull();
    expect(startableNote(5, 7, 7)).toBeNull();
    expect(startableNote(5, 0, 0)).toBeNull();
  });
});
