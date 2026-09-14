import { describe, it, expect } from "vitest";
import {
  MAX_DAYS_EARLY,
  arrivalError,
  arrivalLine,
  daysBeforeStart,
  isTightArrival,
  parseArrival,
} from "./arrival";

const START = "2026-10-20";
const fmtDate = (iso: string) => `D(${iso})`;

describe("reading an arrival date", () => {
  it("accepts a date before the start", () => {
    expect(parseArrival("2026-10-18", START)).toEqual({ date: "2026-10-18", problem: null });
  });
  it("accepts landing on the start day", () => {
    expect(parseArrival(START, START).date).toBe(START);
  });
  it("treats blank as 'not known yet', which is normal", () => {
    expect(parseArrival("", START)).toEqual({ date: null, problem: null });
    expect(parseArrival("   ", START)).toEqual({ date: null, problem: null });
    expect(parseArrival(undefined, START)).toEqual({ date: null, problem: null });
  });
  it("refuses a date after the start", () => {
    expect(parseArrival("2026-10-21", START).problem).toBe("after_start");
  });
  it("refuses something that is not a date", () => {
    expect(parseArrival("next Tuesday", START).problem).toBe("malformed");
    expect(parseArrival("20-10-2026", START).problem).toBe("malformed");
  });
  it("catches the wrong year, which is the typo people make", () => {
    expect(parseArrival("2025-10-18", START).problem).toBe("long_before");
    // The boundary itself is allowed.
    const ok = new Date(Date.parse(`${START}T00:00:00Z`) - MAX_DAYS_EARLY * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(parseArrival(ok, START).problem).toBeNull();
  });
  it("explains each refusal in words", () => {
    expect(arrivalError("after_start", START, fmtDate)).toContain("D(2026-10-20)");
    expect(arrivalError("malformed", START, fmtDate)).toContain("doesn't look like a date");
    expect(arrivalError("long_before", START, fmtDate)).toContain("check the year");
  });
});

describe("the gap before the walk", () => {
  it("counts the days", () => {
    expect(daysBeforeStart("2026-10-18", START)).toBe(2);
    expect(daysBeforeStart(START, START)).toBe(0);
    expect(daysBeforeStart(null, START)).toBeNull();
  });
  it("reads as a sentence a guide can act on", () => {
    expect(arrivalLine("2026-10-16", START, fmtDate)).toBe(
      "Lands in Kathmandu D(2026-10-16) — 4 days before the start",
    );
    expect(arrivalLine("2026-10-19", START, fmtDate)).toContain("the day before");
    expect(arrivalLine(START, START, fmtDate)).toContain("the morning the trek starts");
    expect(arrivalLine(null, START, fmtDate)).toBe("Arrival in Kathmandu: not told yet");
  });
  it("flags a plan with no slack in it", () => {
    expect(isTightArrival(START, START)).toBe(true);
    expect(isTightArrival("2026-10-19", START)).toBe(true);
    expect(isTightArrival("2026-10-17", START)).toBe(false);
    expect(isTightArrival(null, START)).toBe(false);
  });
});
