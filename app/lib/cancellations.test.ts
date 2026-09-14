import { describe, it, expect } from "vitest";
import {
  CANCEL_STATUS,
  guideDetail,
  guideHeadline,
  isCancelled,
  noticeDays,
  opsLine,
  opsSubject,
  reasonFromStatus,
  unseenByGuide,
  type CancelledTrip,
} from "./cancellations";

const trip = (over: Partial<CancelledTrip> = {}): CancelledTrip => ({
  id: "b1",
  status: "cancelled_trekker",
  startDate: "2026-10-20",
  cancelledAt: "2026-10-01T09:00:00Z",
  guideSawAt: null,
  trekkerName: "Sarah",
  title: "Everest Base Camp",
  partySize: 2,
  guideKeepsUsdCents: 0,
  ...over,
});

const fmtDate = (iso: string) => `D(${iso.slice(0, 10)})`;
const fmtNpr = (paisa: number) => `NPR ${(paisa / 100).toFixed(0)}`;

describe("reading a status", () => {
  it("maps each reason to the status it lands on", () => {
    expect(CANCEL_STATUS.trekker).toBe("cancelled_trekker");
    expect(CANCEL_STATUS.guide).toBe("cancelled_guide");
    expect(CANCEL_STATUS.force_majeure).toBe("cancelled_force_majeure");
    // Non-payment is the trekker's side of the deal, so it lands there too.
    expect(CANCEL_STATUS.nonpayment).toBe("cancelled_trekker");
  });
  it("and back again", () => {
    expect(reasonFromStatus("cancelled_guide")).toBe("guide");
    expect(reasonFromStatus("cancelled_force_majeure")).toBe("force_majeure");
    expect(reasonFromStatus("cancelled_trekker")).toBe("trekker");
    expect(reasonFromStatus("confirmed")).toBeNull();
  });
  it("knows a cancelled trip from a live one", () => {
    expect(isCancelled("cancelled_trekker")).toBe(true);
    expect(isCancelled("active")).toBe(false);
    expect(isCancelled(null)).toBe(false);
  });
});

describe("what the guide has not been shown", () => {
  it("is only the unseen ones, newest first", () => {
    const rows = [
      trip({ id: "old", cancelledAt: "2026-09-01T00:00:00Z" }),
      trip({ id: "seen", guideSawAt: "2026-10-02T00:00:00Z" }),
      trip({ id: "new", cancelledAt: "2026-10-05T00:00:00Z" }),
      trip({ id: "live", status: "confirmed" }),
    ];
    expect(unseenByGuide(rows).map((t) => t.id)).toEqual(["new", "old"]);
  });
  it("still shows one a guide missed for a week", () => {
    // Unseen, not recent: a guide who was on the trail must still be told.
    const ancient = trip({ cancelledAt: "2026-01-01T00:00:00Z" });
    expect(unseenByGuide([ancient])).toHaveLength(1);
  });
});

describe("how much notice there was", () => {
  it("counts the days to the start", () => {
    expect(noticeDays(trip())).toBe(19);
  });
  it("is zero or less when the day had already come", () => {
    expect(noticeDays(trip({ cancelledAt: "2026-10-20T06:00:00Z" }))).toBe(0);
    expect(noticeDays(trip({ cancelledAt: "2026-10-25T06:00:00Z" }))).toBe(-5);
  });
  it("is unknown rather than wrong when nothing was recorded", () => {
    expect(noticeDays(trip({ cancelledAt: null }))).toBeNull();
  });
});

describe("the sentence the guide reads", () => {
  it("names the trekker who cancelled", () => {
    expect(guideHeadline(trip())).toBe("Sarah cancelled Everest Base Camp");
  });
  it("does not blame a trekker for the office's decision", () => {
    expect(guideHeadline(trip({ status: "cancelled_force_majeure" }))).toBe(
      "Everest Base Camp was called off",
    );
  });
  it("says so plainly when the guide cancelled it themselves", () => {
    expect(guideHeadline(trip({ status: "cancelled_guide" }))).toBe(
      "You cancelled Everest Base Camp",
    );
  });
  it("gives the notice, the calendar and the money", () => {
    const d = guideDetail(trip({ guideKeepsUsdCents: 10000 }), fmtDate, fmtNpr, 133);
    expect(d).toContain("19 days before the start on D(2026-10-20)");
    expect(d).toContain("open on your calendar again");
    expect(d).toContain("NPR 13300");
  });
  it("says nothing is owed when nothing is", () => {
    expect(guideDetail(trip(), fmtDate, fmtNpr, 133)).toContain("Nothing is owed on it.");
  });
  it("does not say '1 days'", () => {
    const d = guideDetail(trip({ cancelledAt: "2026-10-19T00:00:00Z" }), fmtDate, fmtNpr, 133);
    expect(d).toContain("1 day before");
  });
});

describe("the line the office reads", () => {
  it("says who cancelled and how much notice", () => {
    expect(opsLine(trip(), fmtDate)).toBe(
      "Everest Base Camp, D(2026-10-20) — cancelled by Sarah · 19 days' notice",
    );
  });
  it("attributes a guide cancel and an office cancel correctly", () => {
    expect(opsLine(trip({ status: "cancelled_guide" }), fmtDate)).toContain("by the guide");
    expect(opsLine(trip({ status: "cancelled_force_majeure" }), fmtDate)).toContain(
      "by the office",
    );
  });
  it("has a subject line worth seeing in an inbox", () => {
    expect(opsSubject(trip())).toBe("Cancelled: Everest Base Camp, 2026-10-20");
  });
});
