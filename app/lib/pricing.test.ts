import { describe, it, expect } from "vitest";
import {
  computePricing,
  computeDeposit,
  computeBalance,
  formatUsd,
  formatNpr,
  PERMIT_HANDLING_USD_CENTS,
} from "./pricing";

describe("computePricing — multi-day trek", () => {
  // Guide fee base of $360 → the doc's "You earn $306 of $360" example.
  const fxRateNpr = 133;
  const result = computePricing({
    isMultiDay: true,
    days: 2,
    dayRateUsdCents: 18000, // $180/day
    partySize: 1,
    permitFeesPerPersonUsdCents: 5000, // $50 permits
    fxRateNpr,
  });

  it("computes the guide fee as day_rate × days × party", () => {
    expect(result.guideFeeUsdCents).toBe(36000); // $360
  });

  it("takes 15% commission and pays the guide the remaining 85% — $306 of $360", () => {
    expect(result.commissionUsdCents).toBe(5400); // $54
    expect(result.guideReceivesUsdCents).toBe(30600); // $306
    // commission + payout reconciles to base exactly
    expect(result.commissionUsdCents + result.guideReceivesUsdCents).toBe(36000);
  });

  it("charges the trekker 8% service fee on guide+porter", () => {
    expect(result.serviceFeeUsdCents).toBe(2880); // 8% of $360
  });

  it("adds the $25 flat permit-handling fee on multi-day", () => {
    expect(result.permitHandlingUsdCents).toBe(PERMIT_HANDLING_USD_CENTS);
  });

  it("multiplies permit fees by party size", () => {
    expect(result.permitFeesUsdCents).toBe(5000); // party of 1
  });

  it("totals what the trekker pays", () => {
    // guide 36000 + porter 0 + permits 5000 + service 2880 + handling 2500
    expect(result.totalUsdCents).toBe(46380);
  });

  it("fixes the guide payout in NPR paisa at the booking fx rate", () => {
    expect(result.guidePayoutNprPaisa).toBe(Math.round(30600 * fxRateNpr));
  });
});

describe("computePricing — porters and party size", () => {
  const r = computePricing({
    isMultiDay: true,
    days: 10,
    dayRateUsdCents: 3000, // $30/day
    partySize: 2,
    porterDayRateUsdCents: 2000, // $20/day
    porters: 1,
    permitFeesPerPersonUsdCents: 6900,
    fxRateNpr: 133,
  });

  it("scales guide fee by party and porter fee by porters", () => {
    expect(r.guideFeeUsdCents).toBe(3000 * 10 * 2); // 60000
    expect(r.porterFeeUsdCents).toBe(2000 * 10 * 1); // 20000
  });

  it("bases service fee and commission on guide+porter combined", () => {
    const base = 60000 + 20000;
    expect(r.serviceFeeUsdCents).toBe(Math.round(base * 0.08));
    expect(r.commissionUsdCents).toBe(Math.round(base * 0.15));
  });

  it("charges permits per person", () => {
    expect(r.permitFeesUsdCents).toBe(6900 * 2);
  });
});

describe("computePricing — single-day experience", () => {
  const r = computePricing({
    isMultiDay: false,
    offeringPriceUsdCents: 4000, // $40 pp
    partySize: 3,
    fxRateNpr: 133,
  });

  it("computes guide fee as price × party, with no permits or handling", () => {
    expect(r.guideFeeUsdCents).toBe(12000);
    expect(r.permitFeesUsdCents).toBe(0);
    expect(r.permitHandlingUsdCents).toBe(0);
  });

  it("still charges the 8% service fee", () => {
    expect(r.serviceFeeUsdCents).toBe(Math.round(12000 * 0.08));
    expect(r.totalUsdCents).toBe(12000 + Math.round(12000 * 0.08));
  });
});

describe("computePricing — validation", () => {
  it("rejects a party size below 1", () => {
    expect(() =>
      computePricing({ isMultiDay: false, offeringPriceUsdCents: 100, partySize: 0, fxRateNpr: 133 }),
    ).toThrow();
  });
  it("rejects a non-positive fx rate", () => {
    expect(() =>
      computePricing({ isMultiDay: false, offeringPriceUsdCents: 100, partySize: 1, fxRateNpr: 0 }),
    ).toThrow();
  });
  it("rejects a float money input", () => {
    expect(() =>
      computePricing({ isMultiDay: false, offeringPriceUsdCents: 100.5, partySize: 1, fxRateNpr: 133 }),
    ).toThrow();
  });
});

describe("deposit & balance", () => {
  it("takes a 30% deposit when the trek is 30+ days out", () => {
    expect(computeDeposit(46380, 45)).toBe(Math.round(46380 * 0.3));
  });
  it("charges 100% upfront inside the 14-day window", () => {
    expect(computeDeposit(46380, 10)).toBe(46380);
  });
  it("balance is total minus deposit", () => {
    const total = 46380;
    const dep = computeDeposit(total, 45);
    expect(computeBalance(total, dep)).toBe(total - dep);
  });
  it("balance is zero when paid in full upfront", () => {
    expect(computeBalance(46380, 46380)).toBe(0);
  });
});

describe("formatting", () => {
  it("formats USD with a $ symbol and no trailing .00 for whole dollars", () => {
    expect(formatUsd(36000)).toBe("$360");
    expect(formatUsd(46380)).toBe("$463.80");
  });
  it("formats NPR with the रू symbol", () => {
    expect(formatNpr(4069800)).toBe("रू 40,698");
  });
});
