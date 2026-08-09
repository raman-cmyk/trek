import { describe, it, expect } from "vitest";
import {
  computeCancellation,
  bandFor,
  estimateStripeFeeUsdCents,
  guideStrikeConsequence,
} from "./policy";

const paid = 46380; // trekker paid $463.80
const guideFee = 36000; // $360 guide fee

describe("cancellation bands", () => {
  it("maps day counts to the right band", () => {
    expect(bandFor({ totalPaidUsdCents: paid, guideFeeUsdCents: guideFee, daysUntilStart: 45, reason: "trekker" })).toBe("ge30");
    expect(bandFor({ totalPaidUsdCents: paid, guideFeeUsdCents: guideFee, daysUntilStart: 30, reason: "trekker" })).toBe("ge30");
    expect(bandFor({ totalPaidUsdCents: paid, guideFeeUsdCents: guideFee, daysUntilStart: 29, reason: "trekker" })).toBe("d15_29");
    expect(bandFor({ totalPaidUsdCents: paid, guideFeeUsdCents: guideFee, daysUntilStart: 15, reason: "trekker" })).toBe("d15_29");
    expect(bandFor({ totalPaidUsdCents: paid, guideFeeUsdCents: guideFee, daysUntilStart: 14, reason: "trekker" })).toBe("d7_14");
    expect(bandFor({ totalPaidUsdCents: paid, guideFeeUsdCents: guideFee, daysUntilStart: 7, reason: "trekker" })).toBe("d7_14");
    expect(bandFor({ totalPaidUsdCents: paid, guideFeeUsdCents: guideFee, daysUntilStart: 6, reason: "trekker" })).toBe("lt7");
  });
});

describe("trekker cancels — refund/compensation matrix", () => {
  it("≥30 days: 100% refund minus Stripe fees, no guide comp", () => {
    const o = computeCancellation({ totalPaidUsdCents: paid, guideFeeUsdCents: guideFee, daysUntilStart: 45, reason: "trekker" });
    const fee = estimateStripeFeeUsdCents(paid);
    expect(o.refundToTrekkerUsdCents).toBe(paid - fee);
    expect(o.stripeFeesWithheldUsdCents).toBe(fee);
    expect(o.guideCompensationUsdCents).toBe(0);
  });

  it("15-29 days: 50% refund, 25% guide comp", () => {
    const o = computeCancellation({ totalPaidUsdCents: paid, guideFeeUsdCents: guideFee, daysUntilStart: 20, reason: "trekker" });
    expect(o.refundToTrekkerUsdCents).toBe(Math.round(paid * 0.5));
    expect(o.guideCompensationUsdCents).toBe(Math.round(guideFee * 0.25));
  });

  it("7-14 days: 25% refund, 50% guide comp", () => {
    const o = computeCancellation({ totalPaidUsdCents: paid, guideFeeUsdCents: guideFee, daysUntilStart: 10, reason: "trekker" });
    expect(o.refundToTrekkerUsdCents).toBe(Math.round(paid * 0.25));
    expect(o.guideCompensationUsdCents).toBe(Math.round(guideFee * 0.5));
  });

  it("<7 days: no refund, 50% guide comp", () => {
    const o = computeCancellation({ totalPaidUsdCents: paid, guideFeeUsdCents: guideFee, daysUntilStart: 3, reason: "trekker" });
    expect(o.refundToTrekkerUsdCents).toBe(0);
    expect(o.guideCompensationUsdCents).toBe(Math.round(guideFee * 0.5));
  });
});

describe("force majeure and guide cancellation", () => {
  it("force majeure: 100% refund, platform absorbs fees, no guide comp", () => {
    const o = computeCancellation({ totalPaidUsdCents: paid, guideFeeUsdCents: guideFee, daysUntilStart: 5, reason: "force_majeure" });
    expect(o.refundToTrekkerUsdCents).toBe(paid);
    expect(o.platformAbsorbsFees).toBe(true);
    expect(o.stripeFeesWithheldUsdCents).toBe(0);
    expect(o.guideCompensationUsdCents).toBe(0);
  });

  it("guide cancels: trekker fully refunded regardless of timing", () => {
    const o = computeCancellation({ totalPaidUsdCents: paid, guideFeeUsdCents: guideFee, daysUntilStart: 2, reason: "guide" });
    expect(o.band).toBe("guide_cancel");
    expect(o.refundToTrekkerUsdCents).toBe(paid);
    expect(o.platformAbsorbsFees).toBe(true);
  });
});

describe("guide strike ladder", () => {
  it("escalates warning → 90-day ranking penalty → removal", () => {
    expect(guideStrikeConsequence(0)).toBe("warning");
    expect(guideStrikeConsequence(1)).toBe("ranking_penalty_90d");
    expect(guideStrikeConsequence(2)).toBe("removal");
    expect(guideStrikeConsequence(5)).toBe("removal");
  });
});
