import { describe, expect, it } from "vitest";
import { clashingDays, DaysTakenError } from "./booking.server";

/**
 * The query clashingDays makes, and nothing else: select day+status from
 * availability, filtered by guide, a date range, and a status list.
 */
function fakeAdmin(rows: Array<{ guide_id: string; day: string; status: string }>) {
  return {
    from() {
      const f: any = { eq: {}, gte: "", lte: "", in: [] as string[] };
      const api: any = {
        select: () => api,
        eq: (k: string, v: any) => ((f.eq[k] = v), api),
        gte: (_k: string, v: string) => ((f.gte = v), api),
        lte: (_k: string, v: string) => ((f.lte = v), api),
        in: (_k: string, v: string[]) => ((f.in = v), api),
        then: (onF: any) =>
          Promise.resolve({
            data: rows.filter(
              (r) =>
                r.guide_id === f.eq.guide_id &&
                r.day >= f.gte &&
                r.day <= f.lte &&
                f.in.includes(r.status),
            ),
            error: null,
          }).then(onF),
      };
      return api;
    },
  } as any;
}

const g = "guide-1";
const span = ["2026-10-01", "2026-10-05"] as const;

describe("clashingDays", () => {
  it("finds nothing when the week is open", async () => {
    const admin = fakeAdmin([
      { guide_id: g, day: "2026-10-02", status: "open" },
      { guide_id: g, day: "2026-10-03", status: "open" },
    ]);
    expect(await clashingDays(admin, g, ...span)).toEqual([]);
  });

  it("names the days another booking already holds", async () => {
    const admin = fakeAdmin([
      { guide_id: g, day: "2026-10-02", status: "held" },
      { guide_id: g, day: "2026-10-03", status: "booked" },
      { guide_id: g, day: "2026-10-04", status: "open" },
    ]);
    expect(await clashingDays(admin, g, ...span)).toEqual(["2026-10-02", "2026-10-03"]);
  });

  it("counts a day the guide blocked for themselves", async () => {
    const admin = fakeAdmin([{ guide_id: g, day: "2026-10-04", status: "blocked" }]);
    expect(await clashingDays(admin, g, ...span)).toEqual(["2026-10-04"]);
  });

  it("treats a day with no row at all as free", async () => {
    // Guides who never opened a calendar still take bookings, and a guide who
    // proposes dates is the authority on their own week.
    expect(await clashingDays(fakeAdmin([]), g, ...span)).toEqual([]);
  });

  it("ignores another guide's calendar, and days outside the trek", async () => {
    const admin = fakeAdmin([
      { guide_id: "guide-2", day: "2026-10-02", status: "booked" },
      { guide_id: g, day: "2026-09-30", status: "booked" },
      { guide_id: g, day: "2026-10-06", status: "booked" },
    ]);
    expect(await clashingDays(admin, g, ...span)).toEqual([]);
  });
});

describe("DaysTakenError", () => {
  it("carries the days, so the guide is told which ones", () => {
    const e = new DaysTakenError(["2026-10-02", "2026-10-03"]);
    expect(e.days).toEqual(["2026-10-02", "2026-10-03"]);
    expect(e).toBeInstanceOf(Error);
    expect(String(e)).toContain("2026-10-02");
  });
});
