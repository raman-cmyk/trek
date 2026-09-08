import { describe, expect, it } from "vitest";
import { checkinIsDue, dayLabel, needsClosing, trekDay } from "./checkin";

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
