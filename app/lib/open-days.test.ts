import { describe, expect, it } from "vitest";
import {
  OPEN_HORIZON_DAYS,
  clipToHorizon,
  horizonEnd,
  longestOpenRun,
  longestRun,
  openDayCount,
  openDaysIn,
} from "./open-days";

const TODAY = "2026-09-19";

describe("openDaysIn", () => {
  it("a guide who has never touched their calendar is free all week", () => {
    // The whole point. This is the case that was broken in production: no
    // rows meant no open days meant no request form on the guide's own page.
    expect(openDaysIn({ from: "2026-10-01", to: "2026-10-05" }, [], TODAY)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
    ]);
  });

  it("leaves out the days something has taken", () => {
    expect(
      openDaysIn({ from: "2026-10-01", to: "2026-10-05" }, ["2026-10-03"], TODAY),
    ).toEqual(["2026-10-01", "2026-10-02", "2026-10-04", "2026-10-05"]);
  });

  it("never offers a day that has already been", () => {
    const days = openDaysIn({ from: "2026-09-01", to: "2026-09-21" }, [], TODAY);
    expect(days[0]).toBe(TODAY);
    expect(days).toEqual([TODAY, "2026-09-20", "2026-09-21"]);
  });

  it("stops at the horizon rather than promising a guide is free forever", () => {
    const far = openDaysIn({ from: "2030-01-01", to: "2030-01-10" }, [], TODAY);
    expect(far).toEqual([]);
  });

  it("answers for the part of a window that is inside the horizon", () => {
    const end = horizonEnd(TODAY);
    const days = openDaysIn({ from: end, to: "2030-01-01" }, [], TODAY);
    expect(days).toEqual([end]);
  });

  it("takes a Set as readily as a list", () => {
    expect(
      openDaysIn({ from: "2026-10-01", to: "2026-10-03" }, new Set(["2026-10-02"]), TODAY),
    ).toEqual(["2026-10-01", "2026-10-03"]);
  });
});

describe("clipToHorizon", () => {
  it("pulls the near end forward to today", () => {
    expect(clipToHorizon({ from: "2026-01-01", to: "2026-10-01" }, TODAY)).toEqual({
      from: TODAY,
      to: "2026-10-01",
    });
  });

  it("is null for a window entirely in the past", () => {
    expect(clipToHorizon({ from: "2026-01-01", to: "2026-02-01" }, TODAY)).toBeNull();
  });

  it("is null for a window entirely past the horizon", () => {
    expect(clipToHorizon({ from: "2031-01-01", to: "2031-02-01" }, TODAY)).toBeNull();
  });

  it("the horizon is a year out", () => {
    expect(OPEN_HORIZON_DAYS).toBe(365);
    expect(horizonEnd(TODAY)).toBe("2027-09-19");
  });
});

describe("longestRun", () => {
  it("is the longest unbroken stretch, not the count", () => {
    expect(
      longestRun(["2026-10-01", "2026-10-02", "2026-10-04", "2026-10-05", "2026-10-06"]),
    ).toBe(3);
  });

  it("does not care what order the days arrive in", () => {
    expect(longestRun(["2026-10-06", "2026-10-04", "2026-10-05"])).toBe(3);
  });

  it("is zero for nothing and one for a lone day", () => {
    expect(longestRun([])).toBe(0);
    expect(longestRun(["2026-10-01"])).toBe(1);
  });

  it("counts across a month end", () => {
    expect(longestRun(["2026-09-30", "2026-10-01", "2026-10-02"])).toBe(3);
  });
});

describe("longestOpenRun", () => {
  it("an untouched calendar is free for the whole window", () => {
    // A fourteen-day trek asked for inside a thirty-day window has to come
    // back with at least fourteen, or the search drops the guide.
    expect(longestOpenRun({ from: "2026-10-01", to: "2026-10-30" }, [], TODAY)).toBe(30);
  });

  it("a blocked day in the middle splits the window", () => {
    expect(
      longestOpenRun({ from: "2026-10-01", to: "2026-10-30" }, ["2026-10-20"], TODAY),
    ).toBe(19);
  });

  it("a guide who has blocked every day is free for nothing", () => {
    const all = openDaysIn({ from: "2026-10-01", to: "2026-10-05" }, [], TODAY);
    expect(longestOpenRun({ from: "2026-10-01", to: "2026-10-05" }, all, TODAY)).toBe(0);
  });

  it("agrees with counting the days the long way round", () => {
    const win = { from: "2026-10-01", to: "2026-10-10" };
    const taken = ["2026-10-04", "2026-10-05"];
    expect(openDayCount(win, taken, TODAY)).toBe(8);
    expect(longestOpenRun(win, taken, TODAY)).toBe(5);
  });
});
