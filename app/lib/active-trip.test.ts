import { describe, expect, it } from "vitest";
import { activeTripHref, isUnderway, pickActiveTrip, type TripWindow } from "./active-trip";

const t = (id: string, startDate: string, endDate: string | null): TripWindow => ({
  id,
  startDate,
  endDate,
});
const TODAY = "2026-09-16";

describe("pickActiveTrip", () => {
  it("picks the trek happening today over an older one left open", () => {
    // The reported fault: an August trek nobody closed outranked the
    // September one the guide was standing on, and handed over a different
    // party's emergency contact.
    const august = t("aug", "2026-08-06", "2026-08-20");
    const now = t("sep", "2026-09-09", "2026-09-22");
    expect(pickActiveTrip([august, now], TODAY)?.id).toBe("sep");
    // Order of the input must not matter.
    expect(pickActiveTrip([now, august], TODAY)?.id).toBe("sep");
  });

  it("counts the first and last day as on the trek", () => {
    expect(pickActiveTrip([t("a", "2026-09-16", "2026-09-20")], TODAY)?.id).toBe("a");
    expect(pickActiveTrip([t("b", "2026-09-10", "2026-09-16")], TODAY)?.id).toBe("b");
  });

  it("treats a one-day trip with no end date as ending the day it starts", () => {
    expect(pickActiveTrip([t("day", "2026-09-16", null)], TODAY)?.id).toBe("day");
    expect(isUnderway(t("day", "2026-09-15", null), TODAY)).toBe(false);
  });

  it("falls back to the next one starting, when none is underway", () => {
    const later = t("later", "2026-10-01", "2026-10-10");
    const soon = t("soon", "2026-09-20", "2026-09-30");
    const old = t("old", "2026-08-01", "2026-08-10");
    expect(pickActiveTrip([later, old, soon], TODAY)?.id).toBe("soon");
  });

  it("falls back to the most recently ended when everything is in the past", () => {
    const older = t("older", "2026-07-01", "2026-07-10");
    const recent = t("recent", "2026-08-01", "2026-08-20");
    expect(pickActiveTrip([older, recent], TODAY)?.id).toBe("recent");
  });

  it("prefers the most recently started if two somehow overlap today", () => {
    const a = t("a", "2026-09-01", "2026-09-30");
    const b = t("b", "2026-09-14", "2026-09-18");
    expect(pickActiveTrip([a, b], TODAY)?.id).toBe("b");
  });

  it("is null when there is nothing", () => {
    expect(pickActiveTrip([], TODAY)).toBeNull();
  });
});

describe("isUnderway", () => {
  it("separates a trek happening now from one merely left open", () => {
    expect(isUnderway(t("a", "2026-09-09", "2026-09-22"), TODAY)).toBe(true);
    expect(isUnderway(t("b", "2026-08-06", "2026-08-20"), TODAY)).toBe(false);
    expect(isUnderway(null, TODAY)).toBe(false);
  });
});

describe("activeTripHref", () => {
  it("names the booking, so three open treks are three different links", () => {
    expect(activeTripHref("abc")).toBe("/g/active?booking=abc");
  });

  it("falls back to letting the page choose", () => {
    expect(activeTripHref(null)).toBe("/g/active");
    expect(activeTripHref()).toBe("/g/active");
  });
});
