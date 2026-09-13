import { describe, expect, it } from "vitest";
import {
  bySoonest,
  filterCounts,
  isFilterKey,
  manualEntryProblem,
  matchesFilter,
  stampsFor,
  statusesFor,
} from "./permits";

describe("the filters", () => {
  it("answers the questions the page is actually asked", () => {
    expect(statusesFor("ready")).toEqual(["ready"]);
    expect(statusesFor("rejected")).toEqual(["rejected"]);
    expect(statusesFor("awaiting")).toEqual(["awaiting_docs"]);
    // "Sent off and not back yet" is one question, not two.
    expect(statusesFor("in_flight")).toEqual(["filed", "approved"]);
  });

  it("covers every status under All, so nothing can hide", () => {
    for (const s of ["awaiting_docs", "filed", "approved", "ready", "rejected"]) {
      expect(matchesFilter(s, "all")).toBe(true);
    }
  });

  it("puts every status in exactly one tab besides All", () => {
    const tabs = ["awaiting", "in_flight", "ready", "rejected"] as const;
    for (const s of ["awaiting_docs", "filed", "approved", "ready", "rejected"]) {
      expect(tabs.filter((t) => matchesFilter(s, t))).toHaveLength(1);
    }
  });

  it("falls back to everything for a key it does not know", () => {
    expect(statusesFor("nonsense" as any)).toHaveLength(5);
    expect(isFilterKey("ready")).toBe(true);
    expect(isFilterKey("nonsense")).toBe(false);
    expect(isFilterKey(null)).toBe(false);
  });
});

describe("filterCounts", () => {
  it("counts what each tab would show", () => {
    const rows = [
      { status: "ready" },
      { status: "ready" },
      { status: "rejected" },
      { status: "awaiting_docs" },
      { status: "filed" },
      { status: "approved" },
    ];
    expect(filterCounts(rows)).toEqual({
      all: 6,
      awaiting: 1,
      in_flight: 2,
      ready: 2,
      rejected: 1,
    });
  });

  it("is all zeroes for an empty tracker", () => {
    expect(filterCounts([])).toEqual({ all: 0, awaiting: 0, in_flight: 0, ready: 0, rejected: 0 });
  });
});

describe("bySoonest", () => {
  it("puts the trek that leaves first at the top", () => {
    const rows = [
      { booking: { start_date: "2026-10-01" } },
      { booking: { start_date: "2026-08-07" } },
      { booking: { start_date: "2026-09-09" } },
    ];
    expect(bySoonest(rows).map((r) => r.booking.start_date)).toEqual([
      "2026-08-07",
      "2026-09-09",
      "2026-10-01",
    ]);
  });

  it("sends a row with no date to the bottom, not the top", () => {
    // An empty string sorts before every date, which would have put the row
    // nobody can act on above the trek leaving on Friday.
    const rows = [
      { booking: { start_date: "2026-10-01" } },
      { booking: null },
      { booking: { start_date: "2026-08-07" } },
    ];
    expect(bySoonest(rows).map((r) => r.booking?.start_date ?? "none")).toEqual([
      "2026-08-07",
      "2026-10-01",
      "none",
    ]);
  });

  it("does not mutate what it was given", () => {
    const rows = [{ booking: { start_date: "2026-10-01" } }, { booking: { start_date: "2026-01-01" } }];
    const before = rows.map((r) => r.booking.start_date);
    bySoonest(rows);
    expect(rows.map((r) => r.booking.start_date)).toEqual(before);
  });
});

describe("manualEntryProblem", () => {
  const ok = { bookingId: "b1", permitId: "p1", status: "ready" };
  it("accepts a complete entry", () => {
    expect(manualEntryProblem(ok)).toBeNull();
  });
  it("insists on a booking and a permit", () => {
    expect(manualEntryProblem({ ...ok, bookingId: "" })).toMatch(/booking/i);
    expect(manualEntryProblem({ ...ok, permitId: "" })).toMatch(/which permit/i);
  });
  it("refuses a status that is not one of ours", () => {
    expect(manualEntryProblem({ ...ok, status: "issued" })).toMatch(/not a permit status/i);
  });
});

describe("stampsFor", () => {
  const now = new Date("2026-09-13T10:00:00Z");
  it("dates a hand-logged permit the way a filed one would be", () => {
    expect(stampsFor("ready", now)).toEqual({
      filed_at: "2026-09-13T10:00:00.000Z",
      approved_at: "2026-09-13T10:00:00.000Z",
    });
    expect(stampsFor("filed", now)).toEqual({ filed_at: "2026-09-13T10:00:00.000Z" });
    expect(stampsFor("approved", now)).toEqual({
      filed_at: "2026-09-13T10:00:00.000Z",
      approved_at: "2026-09-13T10:00:00.000Z",
    });
  });

  it("stamps nothing for a permit that has not gone anywhere", () => {
    expect(stampsFor("awaiting_docs", now)).toEqual({});
    expect(stampsFor("rejected", now)).toEqual({});
  });
});
