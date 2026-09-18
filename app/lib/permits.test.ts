import { describe, expect, it } from "vitest";
import {
  PERMIT_CODES,
  bySoonest,
  manualEntryProblem,
  permitCodeFor,
  permitCodeLabel,
  routeNeedsTims,
  stampsFor,
} from "./permits";

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

describe("what kind of permit it is", () => {
  it("finds TIMS by what it is, not by a string match on 'TIMS Card'", () => {
    expect(permitCodeFor("TIMS Card")).toBe("tims");
    expect(permitCodeFor("Trekkers' Information Management System (TIMS)")).toBe("tims");
  });

  it("keeps ACAP and MCAP apart — Manaslu Circuit carries both", () => {
    expect(permitCodeFor("Annapurna Conservation Area Permit (ACAP)")).toBe("acap");
    expect(permitCodeFor("Manaslu Conservation Area Permit (MCAP)")).toBe("mcap");
    expect(permitCodeFor("Manaslu Restricted Area Permit")).toBe("restricted");
  });

  it("reads the seeded names the way 0102 backfilled them", () => {
    expect(permitCodeFor("Sagarmatha National Park Entry")).toBe("park_entry");
    expect(permitCodeFor("Khumbu Pasang Lhamu Rural Municipality Fee")).toBe("municipality");
  });

  it("says 'other' rather than guessing", () => {
    expect(permitCodeFor("Some new fee nobody has seen")).toBe("other");
  });

  it("answers the question that was never asked: does this route need TIMS?", () => {
    // Everest Base Camp has a park entry and a municipality fee and no TIMS
    // row — and six blue cards have been issued against bookings on it.
    expect(routeNeedsTims([{ code: "park_entry" }, { code: "municipality" }])).toBe(false);
    expect(routeNeedsTims([{ code: "park_entry" }, { code: "tims" }])).toBe(true);
    expect(routeNeedsTims([])).toBe(false);
  });

  it("has a word for every code, so no screen prints a slug", () => {
    for (const c of PERMIT_CODES) expect(permitCodeLabel(c.code)).not.toBe(c.code);
  });
});
