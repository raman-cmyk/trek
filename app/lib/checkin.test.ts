import { describe, expect, it } from "vitest";
import { canRecord, checkinIsDue, dayLabel, missingDays, needsClosing, trekDay, wasLate, missedRunEndingAt, needsWelfareCheck } from "./checkin";

// The real booking that produced "day 34" on a fourteen-day trek: it ran
// 6–20 August, nobody closed it, and today is the 8th of September.
const EBC = ["2026-08-06", "2026-08-20"] as const;

describe("trekDay", () => {
  it("is day 1 on the day the trek starts", () => {
    const w = trekDay(...EBC, "2026-08-06");
    expect(w.day).toBe(1);
    expect(w.where).toBe("on");
  });

  it("is the last day on the day it ends, and knows it", () => {
    const w = trekDay(...EBC, "2026-08-20");
    expect(w.day).toBe(15);
    expect(w.total).toBe(15);
    expect(w.lastDay).toBe(true);
  });

  it("never runs past the end — this is the day-34 bug", () => {
    const w = trekDay(...EBC, "2026-09-08");
    expect(w.day).toBe(15);
    expect(w.where).toBe("after");
    expect(dayLabel(w)).toBe("Finished");
  });

  it("counts down before it starts rather than counting up", () => {
    const w = trekDay(...EBC, "2026-08-03");
    expect(w.where).toBe("before");
    expect(w.daysUntilStart).toBe(3);
    expect(w.day).toBe(1);
    expect(dayLabel(w)).toBe("Starts in 3 days");
    expect(dayLabel(trekDay(...EBC, "2026-08-05"))).toBe("Starts tomorrow");
  });

  it("copes with a one-day trip", () => {
    const w = trekDay("2026-08-06", "2026-08-06", "2026-08-06");
    expect(w).toMatchObject({ day: 1, total: 1, where: "on", lastDay: true });
  });

  it("does not go backwards when the dates are the wrong way round", () => {
    const w = trekDay("2026-08-20", "2026-08-06", "2026-08-20");
    expect(w.total).toBe(1);
    expect(w.day).toBe(1);
  });
});

describe("checkinIsDue", () => {
  it("is asked only while the trek is running", () => {
    expect(checkinIsDue(trekDay(...EBC, "2026-08-10"), false)).toBe(true);
    expect(checkinIsDue(trekDay(...EBC, "2026-08-03"), false)).toBe(false);
    expect(checkinIsDue(trekDay(...EBC, "2026-09-08"), false)).toBe(false);
  });

  it("is not asked twice in a day", () => {
    expect(checkinIsDue(trekDay(...EBC, "2026-08-10"), true)).toBe(false);
  });
});

describe("needsClosing", () => {
  it("spots a trek that finished and was never closed", () => {
    expect(needsClosing(trekDay(...EBC, "2026-09-08"), "active")).toBe(true);
  });

  it("leaves a running trek and a closed one alone", () => {
    expect(needsClosing(trekDay(...EBC, "2026-08-10"), "active")).toBe(false);
    expect(needsClosing(trekDay(...EBC, "2026-09-08"), "completed")).toBe(false);
  });
});

describe("dayLabel", () => {
  it("says the last day is the last day", () => {
    expect(dayLabel(trekDay(...EBC, "2026-08-20"))).toBe("Last day — day 15");
    expect(dayLabel(trekDay(...EBC, "2026-08-10"))).toBe("Day 5 of 15");
  });
});

describe("missingDays — the record, not the alarm", () => {
  const START = "2026-10-01";
  const END = "2026-10-07"; // seven days

  it("is every day so far when nothing has been sent", () => {
    expect(missingDays(START, END, "2026-10-03", [])).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
  });

  it("is the gap a week out of signal leaves behind", () => {
    // The case this exists for: signal on day 1, nothing until day 6.
    expect(missingDays(START, END, "2026-10-06", ["2026-10-01"])).toEqual([
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
    ]);
  });

  it("never asks for a day that has not happened", () => {
    expect(missingDays(START, END, "2026-10-02", [])).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("still lists the whole trek after it has finished", () => {
    // The guide walks out on the 8th and fills the record in Kathmandu.
    expect(missingDays(START, END, "2026-10-20", ["2026-10-01"])).toHaveLength(6);
  });

  it("is empty before the trek starts, and when it is all in", () => {
    expect(missingDays(START, END, "2026-09-28", [])).toEqual([]);
    const every = ["01", "02", "03", "04", "05", "06", "07"].map((d) => `2026-10-${d}`);
    expect(missingDays(START, END, "2026-10-20", every)).toEqual([]);
  });

  it("does not mind a timestamp where a date was expected", () => {
    expect(missingDays(START, END, "2026-10-02", ["2026-10-01T04:00:00Z"])).toEqual([
      "2026-10-02",
    ]);
  });
});

describe("canRecord", () => {
  const START = "2026-10-01";
  const END = "2026-10-07";

  it("allows a day that has passed — the point of the whole thing", () => {
    expect(canRecord(START, END, "2026-10-06", "2026-10-02")).toBe(true);
  });

  it("allows the record to be completed after the trek", () => {
    expect(canRecord(START, END, "2026-10-20", "2026-10-04")).toBe(true);
  });

  it("refuses the future and anything outside the trek", () => {
    expect(canRecord(START, END, "2026-10-02", "2026-10-05")).toBe(false);
    expect(canRecord(START, END, "2026-10-20", "2026-09-30")).toBe(false);
    expect(canRecord(START, END, "2026-10-20", "2026-10-08")).toBe(false);
  });
});

describe("wasLate", () => {
  it("knows an update written up afterwards", () => {
    expect(wasLate("2026-10-02", "2026-10-06T09:00:00Z")).toBe(true);
    expect(wasLate("2026-10-02", "2026-10-02T22:00:00Z")).toBe(false);
  });
});

describe("two silent days, and the office picks up a phone", () => {
  const START = "2026-08-07";
  const END = "2026-08-21";

  it("counts the run backwards from today, not the total gaps", () => {
    // Missing days 2 and 9 of a trek that has reported since: out of signal
    // twice, and fine.
    const done = [
      "2026-08-07", "2026-08-09", "2026-08-10", "2026-08-11",
      "2026-08-12", "2026-08-13", "2026-08-14",
    ];
    expect(missedRunEndingAt(START, END, "2026-08-14", done)).toBe(0);
    expect(needsWelfareCheck(0)).toBe(false);
  });

  it("one silent day is ordinary", () => {
    const done = ["2026-08-07", "2026-08-08", "2026-08-09"];
    expect(missedRunEndingAt(START, END, "2026-08-10", done)).toBe(1);
    expect(needsWelfareCheck(1)).toBe(false);
  });

  it("two in a row is not", () => {
    const done = ["2026-08-07", "2026-08-08", "2026-08-09"];
    expect(missedRunEndingAt(START, END, "2026-08-11", done)).toBe(2);
    expect(needsWelfareCheck(2)).toBe(true);
  });

  it("closes the run the moment a late check-in arrives", () => {
    const silent = ["2026-08-07", "2026-08-08"];
    expect(missedRunEndingAt(START, END, "2026-08-11", silent)).toBe(3);
    // The guide fills in yesterday from the trail. Still nothing for today,
    // so one day open — but nobody is missing.
    const caughtUp = [...silent, "2026-08-09", "2026-08-10"];
    expect(missedRunEndingAt(START, END, "2026-08-11", caughtUp)).toBe(1);
    expect(needsWelfareCheck(1)).toBe(false);
  });

  it("counts a trek that has never checked in at all", () => {
    expect(missedRunEndingAt(START, END, "2026-08-09", [])).toBe(3);
  });

  it("says nothing about a trek that has not started", () => {
    expect(missedRunEndingAt(START, END, "2026-08-01", [])).toBe(0);
  });

  it("stops at the last day once the trek is over", () => {
    // Fifteen days, none reported — not a run of fifty because time passed.
    expect(missedRunEndingAt(START, END, "2026-09-30", [])).toBe(15);
  });
});
