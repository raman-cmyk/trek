import { describe, it, expect } from "vitest";
import { byReason, reasonLabel, refundTotals, whoCancelled } from "./cancellations";

describe("how much went back", () => {
  it("reads a refund stored as a negative as money that went back", () => {
    expect(refundTotals([{ booking_id: "b1", amount_usd_cents: -34442 }])).toEqual({
      b1: 34442,
    });
  });

  it("adds up a refund split across several payment intents", () => {
    // A trip paid in a deposit and two instalments refunds in three rows.
    const total = refundTotals([
      { booking_id: "b1", amount_usd_cents: -10000 },
      { booking_id: "b1", amount_usd_cents: -5000 },
      { booking_id: "b1", amount_usd_cents: -2500 },
      { booking_id: "b2", amount_usd_cents: -100 },
    ]);
    expect(total.b1).toBe(17500);
    expect(total.b2).toBe(100);
  });

  it("says nothing for a trip that was never paid for", () => {
    expect(refundTotals([])).toEqual({});
    expect(refundTotals([])["b1"]).toBeUndefined();
  });
});

describe("who did it", () => {
  it("tells an automatic non-payment cancel apart from a trekker changing their mind", () => {
    // Both are status `cancelled_trekker`. Only the reason distinguishes them,
    // and getting this wrong tells the office trekkers cancelled trips they
    // never touched.
    expect(whoCancelled("nonpayment")).toBe("platform");
    expect(whoCancelled("trekker")).toBe("trekker");
  });

  it("does not blame anybody for the weather", () => {
    expect(whoCancelled("force_majeure")).toBe("platform");
  });

  it("says it does not know rather than guessing", () => {
    expect(whoCancelled(null)).toBe("unknown");
    expect(whoCancelled("")).toBe("unknown");
  });
});

describe("the words in the why column", () => {
  it("undoes the collapse the status makes", () => {
    expect(reasonLabel("cancelled_trekker", "nonpayment")).toContain("Not paid in time");
    expect(reasonLabel("cancelled_trekker", "trekker")).toBe("Trekker cancelled");
  });

  it("names the other ways a trip dies", () => {
    expect(reasonLabel("cancelled_guide", "guide")).toBe("Guide pulled out");
    expect(reasonLabel("cancelled_trekker", "hold_expired")).toContain("Hold ran out");
    expect(reasonLabel("cancelled_force_majeure", "force_majeure")).toBe("Force majeure");
  });

  it("says so plainly when nobody recorded a reason", () => {
    // Rather than printing the status and letting it pass for a reason.
    expect(reasonLabel("cancelled_trekker", null)).toBe("trekker — reason not recorded");
    expect(reasonLabel("", null)).toBe("Reason not recorded");
  });
});

describe("grouping", () => {
  it("puts the commonest reason first — what the office is losing trips to", () => {
    const groups = byReason([
      { cancellation_reason: "trekker" },
      { cancellation_reason: "nonpayment" },
      { cancellation_reason: "trekker" },
      { cancellation_reason: "trekker" },
    ]);
    expect(groups[0].reason).toBe("trekker");
    expect(groups[0].rows).toHaveLength(3);
    expect(groups[1].reason).toBe("nonpayment");
  });

  it("keeps the ones with no reason as their own group, not scattered", () => {
    const groups = byReason([{ cancellation_reason: null }, { cancellation_reason: "" }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe("");
  });
});
