import { describe, expect, it } from "vitest";
import { bySoonest, manualEntryProblem, stampsFor } from "./permits";

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
