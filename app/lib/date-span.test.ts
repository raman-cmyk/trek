import { describe, expect, it } from "vitest";
import {
  canPage,
  canStart,
  daysLabel,
  firstTakenDay,
  formatSpan,
  monthInView,
  monthStart,
  pageMonth,
  shouldFollowDate,
  spanMonths,
  rangeDays,
  shiftMonth,
  spanDays,
  spanEnd,
  startableDays,
} from "./date-span";

describe("spanDays / spanEnd", () => {
  it("a twelve-day trek starting the 20th ends on the 31st, not the 1st", () => {
    expect(spanEnd("2026-08-20", 12)).toBe("2026-08-31");
    expect(spanDays("2026-08-20", 12)).toHaveLength(12);
  });

  it("crosses a month end", () => {
    expect(spanEnd("2026-09-28", 5)).toBe("2026-10-02");
  });

  it("a one-day experience starts and ends the same day", () => {
    expect(spanEnd("2026-09-20", 1)).toBe("2026-09-20");
    expect(spanDays("2026-09-20", 1)).toEqual(["2026-09-20"]);
  });

  it("treats a missing or silly length as one day rather than throwing", () => {
    expect(spanEnd("2026-09-20", 0)).toBe("2026-09-20");
    expect(spanEnd("2026-09-20", NaN)).toBe("2026-09-20");
  });
});

describe("rangeDays", () => {
  it("is inclusive at both ends", () => {
    expect(rangeDays("2026-09-20", "2026-09-22")).toEqual([
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
    ]);
  });

  it("does not care which end you clicked first", () => {
    expect(rangeDays("2026-09-22", "2026-09-20")).toEqual(rangeDays("2026-09-20", "2026-09-22"));
  });
});

describe("firstTakenDay", () => {
  const open = new Set(["2026-09-20", "2026-09-21", "2026-09-23"]);

  it("names the day in the middle that is not free", () => {
    expect(firstTakenDay("2026-09-20", 4, open)).toBe("2026-09-22");
  });

  it("is null when the whole span is clear", () => {
    expect(firstTakenDay("2026-09-20", 2, open)).toBeNull();
  });

  it("catches a start day that is itself taken", () => {
    expect(firstTakenDay("2026-09-22", 1, open)).toBe("2026-09-22");
  });
});

describe("startableDays", () => {
  it("a free day near the end of a run is not a place a long trek can start", () => {
    const open = ["2026-09-20", "2026-09-21", "2026-09-22"];
    expect(startableDays(open, 3)).toEqual(["2026-09-20"]);
    expect(startableDays(open, 1)).toEqual(open);
  });

  it("skips a run broken in the middle", () => {
    // 20,21 free · 22 taken · 23,24,25 free
    const open = ["2026-09-20", "2026-09-21", "2026-09-23", "2026-09-24", "2026-09-25"];
    expect(startableDays(open, 3)).toEqual(["2026-09-23"]);
  });

  it("returns nothing when no run is long enough, rather than offering a date that will fail", () => {
    expect(startableDays(["2026-09-20", "2026-09-21"], 5)).toEqual([]);
  });
});

describe("formatSpan", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  it("says the month once when the span stays inside it", () => {
    expect(formatSpan("2026-08-20", "2026-08-31", now)).toBe("20 – 31 Aug");
  });

  it("says both months when it crosses one", () => {
    expect(formatSpan("2026-09-28", "2026-10-02", now)).toBe("28 Sep – 2 Oct");
  });

  it("a single day is a single date", () => {
    expect(formatSpan("2026-09-20", "2026-09-20", now)).toBe("20 Sep");
  });

  it("adds the year only when it is not this one", () => {
    expect(formatSpan("2027-01-04", "2027-01-04", now)).toBe("4 Jan 2027");
    expect(formatSpan("2026-12-28", "2027-01-03", now)).toBe("28 Dec – 3 Jan 2027");
  });

  it("is empty rather than an Invalid Date with nothing chosen", () => {
    expect(formatSpan("", "", now)).toBe("");
  });
});

describe("daysLabel", () => {
  it("does not say 1 days", () => {
    expect(daysLabel(1)).toBe("1 day");
    expect(daysLabel(12)).toBe("12 days");
  });
});

describe("which month the calendar is looking at", () => {
  it("finds the first of the month a date falls in", () => {
    expect(monthStart("2026-09-21")).toBe("2026-09-01");
    expect(monthStart("2026-09-01")).toBe("2026-09-01");
  });

  it("steps forward and back across a year boundary", () => {
    expect(shiftMonth("2026-12-15", 1)).toBe("2027-01-01");
    expect(shiftMonth("2027-01-05", -1)).toBe("2026-12-01");
    expect(shiftMonth("2026-09-21", 3)).toBe("2026-12-01");
  });

  it("is idempotent — shifting by nothing keeps the month", () => {
    expect(shiftMonth("2026-09-21", 0)).toBe("2026-09-01");
  });

  it("knows whether a day is already on screen", () => {
    // One month drawn: only September is visible.
    expect(monthInView("2026-09-30", "2026-09-01", 1)).toBe(true);
    expect(monthInView("2026-10-01", "2026-09-01", 1)).toBe(false);
    // Two, because the trek runs into October.
    expect(monthInView("2026-10-01", "2026-09-01", 2)).toBe(true);
    expect(monthInView("2026-11-01", "2026-09-01", 2)).toBe(false);
    expect(monthInView("2026-08-31", "2026-09-01", 2)).toBe(false);
  });

  it("THE BUG: paging then picking does not land three months on", () => {
    // The old code was `month(chosen day) + offset`, so paging Sep→Dec and
    // then clicking a December day gave December + 3 = March.
    const paged = shiftMonth(shiftMonth(shiftMonth("2026-09-01", 1), 1), 1);
    expect(paged).toBe("2026-12-01");
    // Picking a day inside the month on screen leaves the view alone.
    expect(monthInView("2026-12-14", paged, 1)).toBe(true);
  });

  it("THE OTHER BUG: picking in the trailing month does not walk forward", () => {
    // A trek starting 24 Nov runs into December, so two months are drawn.
    // Clicking 1 Dec used to move the anchor to December and redraw.
    expect(monthInView("2026-12-01", "2026-11-01", 2)).toBe(true);
  });
});

describe("paging the calendar", () => {
  const BOUNDS = { min: "2026-09-01", max: "2027-08-01" };

  describe("spanMonths", () => {
    it("draws one month for a trip that stays inside one", () => {
      expect(spanMonths("2026-09-25", "2026-09-25")).toBe(1);
      expect(spanMonths("2026-09-01", "2026-09-30")).toBe(1);
    });

    it("draws two when the walk runs into the next one", () => {
      expect(spanMonths("2026-09-24", "2026-10-05")).toBe(2);
      expect(spanMonths("2026-12-28", "2027-01-08")).toBe(2);
    });

    it("draws one when no date is chosen yet", () => {
      expect(spanMonths("", "")).toBe(1);
    });

    it("does not change when the reader pages away — the whole point", () => {
      // It used to be measured against the month on screen, so paging back to
      // August made a one-day September trip draw two months, and the size of
      // that window then fed the rule that snapped the view back.
      const before = spanMonths("2026-09-25", "2026-09-25");
      const after = spanMonths("2026-09-25", "2026-09-25");
      expect(before).toBe(after);
      expect(after).toBe(1);
    });
  });

  describe("pageMonth", () => {
    it("steps a month at a time in either direction", () => {
      expect(pageMonth("2026-09-01", 1, BOUNDS)).toBe("2026-10-01");
      expect(pageMonth("2026-10-01", -1, BOUNDS)).toBe("2026-09-01");
    });

    it("crosses a year without incident", () => {
      expect(pageMonth("2026-12-01", 1, BOUNDS)).toBe("2027-01-01");
    });

    it("stops at this month rather than offering the past", () => {
      expect(pageMonth("2026-09-01", -1, BOUNDS)).toBe("2026-09-01");
    });

    it("stops at the last month we know anything about", () => {
      // Past the open horizon every day draws struck-through as "booked",
      // which would be a wall of months the guide is not actually busy in.
      expect(pageMonth("2027-08-01", 1, BOUNDS)).toBe("2027-08-01");
    });
  });

  describe("canPage", () => {
    it("is false at each end, so the arrow can be disabled rather than dead", () => {
      expect(canPage("2026-09-01", -1, BOUNDS)).toBe(false);
      expect(canPage("2027-08-01", 1, BOUNDS)).toBe(false);
    });

    it("is true in the middle", () => {
      expect(canPage("2026-09-01", 1, BOUNDS)).toBe(true);
      expect(canPage("2027-08-01", -1, BOUNDS)).toBe(true);
    });
  });

  describe("shouldFollowDate", () => {
    it("THE BUG: paging away from the chosen date does not drag the view back", () => {
      // His screenshot exactly: a one-day trip on 25 Sep 2026. Pressing ›
      // moved the view to October, this rule found the chosen day off screen
      // and snapped it to September inside the same commit — so the arrow was
      // inert and the only reachable views were September and August+September.
      expect(
        shouldFollowDate({
          day: "2026-09-25",
          previousDay: "2026-09-25",
          visibleMonth: "2026-10-01",
          monthCount: 1,
        }),
      ).toBe(false);
    });

    it("still follows a date that arrived from somewhere other than a click", () => {
      // A fresh page, or a group's agreed dates — nobody saw that happen, so
      // a view showing a different month is just wrong.
      expect(
        shouldFollowDate({
          day: "2027-03-02",
          previousDay: "2026-09-25",
          visibleMonth: "2026-09-01",
          monthCount: 1,
        }),
      ).toBe(true);
    });

    it("leaves the view alone when the new date is already on screen", () => {
      // Clicking a day you can see must never redraw underneath your finger.
      expect(
        shouldFollowDate({
          day: "2026-09-28",
          previousDay: "2026-09-25",
          visibleMonth: "2026-09-01",
          monthCount: 1,
        }),
      ).toBe(false);
      // Including in the trailing month of a two-month span.
      expect(
        shouldFollowDate({
          day: "2026-12-01",
          previousDay: "2026-11-24",
          visibleMonth: "2026-11-01",
          monthCount: 2,
        }),
      ).toBe(false);
    });

    it("has nothing to follow when no date is chosen", () => {
      expect(
        shouldFollowDate({
          day: "",
          previousDay: "",
          visibleMonth: "2026-09-01",
          monthCount: 1,
        }),
      ).toBe(false);
    });
  });

  it("the arrows now walk a reader across the whole year and stop at the end", () => {
    // The shape of the fix end to end, against the case in the screenshot: a
    // one-day trip chosen on 25 Sep, and nothing but › presses. Before, the
    // reader could reach exactly two views; now every month to the horizon,
    // one at a time, with the chosen date untouched in September throughout.
    const FIXED = { day: "2026-09-25", previousDay: "2026-09-25", monthCount: 1 };
    let view = "2026-09-01";
    const seen: string[] = [view];
    for (let i = 0; i < 14; i++) {
      view = pageMonth(view, 1, BOUNDS);
      expect(shouldFollowDate({ ...FIXED, visibleMonth: view })).toBe(false);
      seen.push(view);
    }
    expect(seen[1]).toBe("2026-10-01");
    expect(seen[4]).toBe("2027-01-01");
    // Eleven steps reach the horizon; the remaining presses sit on it.
    expect(seen[11]).toBe("2027-08-01");
    expect(seen[14]).toBe("2027-08-01");
    expect(new Set(seen).size).toBe(12);
  });
});
