import { describe, it, expect } from "vitest";
import { bookingBreakdown, chargeLines, payoutUsdCents } from "./booking-breakdown";

/** The Langtang booking that prompted this, exactly as the row stores it. */
const ITEMISED = {
  guide_fee_usd_cents: 36000,
  porter_fee_usd_cents: 0,
  permit_fees_usd_cents: 3000,
  permit_handling_usd_cents: 0,
  logistics_usd_cents: 36000,
  service_fee_usd_cents: 7500,
  fund_usd_cents: 2250,
  commission_usd_cents: 7500, // the same cut, written into a second column
  total_usd_cents: 84750,
  deposit_usd_cents: 16950,
  guide_payout_npr_paisa: 4788000,
  fx_rate_npr: "133",
};

/** A booking priced the old way: two different cuts, both real. */
const LEGACY = {
  guide_fee_usd_cents: 50000,
  porter_fee_usd_cents: 10000,
  permit_fees_usd_cents: 4000,
  permit_handling_usd_cents: 2500,
  logistics_usd_cents: 0,
  service_fee_usd_cents: 4800, // 8% of guide + porter, charged to the trekker
  fund_usd_cents: 0,
  commission_usd_cents: 9000, // 15% of guide + porter, out of the payout
  total_usd_cents: 71300,
  deposit_usd_cents: 14260,
  guide_payout_npr_paisa: 6783000,
  fx_rate_npr: 133,
};

describe("the lines add up to what was charged", () => {
  it("balances on an itemised booking", () => {
    const b = bookingBreakdown(ITEMISED);
    expect(b.sumUsdCents).toBe(84750);
    expect(b.totalUsdCents).toBe(84750);
    expect(b.balances).toBe(true);
    expect(b.driftUsdCents).toBe(0);
  });

  it("balances on a legacy booking", () => {
    const b = bookingBreakdown(LEGACY);
    expect(b.sumUsdCents).toBe(b.totalUsdCents);
    expect(b.balances).toBe(true);
  });

  it("reports the gap rather than hiding it", () => {
    const b = bookingBreakdown({ ...ITEMISED, total_usd_cents: 80000 });
    expect(b.balances).toBe(false);
    expect(b.driftUsdCents).toBe(4750);
  });
});

describe("the platform's cut is never counted twice", () => {
  it("drops the duplicate commission when it is the same money", () => {
    const b = bookingBreakdown(ITEMISED);
    expect(b.commissionUsdCents).toBeNull();
    // The bug this guards: listing both would make the trek add up to $922.50.
    expect(b.sumUsdCents + 7500).toBe(92250);
    expect(b.sumUsdCents).toBe(84750);
  });

  it("keeps it when it is a second, real cut", () => {
    expect(bookingBreakdown(LEGACY).commissionUsdCents).toBe(9000);
  });

  it("never lists commission among the charge lines either way", () => {
    for (const row of [ITEMISED, LEGACY]) {
      expect(chargeLines(row).map((l) => l.key)).not.toContain("commission");
    }
  });
});

describe("what is shown", () => {
  it("drops the empty lines instead of printing $0.00 six times", () => {
    const keys = chargeLines(ITEMISED).map((l) => l.key);
    expect(keys).toEqual(["guide", "permits", "logistics", "service", "fund"]);
    expect(keys).not.toContain("porters");
  });

  it("keeps the lines in the order the money was added up", () => {
    expect(chargeLines(LEGACY).map((l) => l.key)).toEqual([
      "guide",
      "porters",
      "permits",
      "permit_handling",
      "service",
    ]);
  });

  it("turns the guide's rupee payout back into dollars at the booking's own rate", () => {
    // 47,880 NPR at 133 to the dollar is the $360 guide fee.
    expect(payoutUsdCents(bookingBreakdown(ITEMISED))).toBe(36000);
  });

  it("says nothing rather than dividing by a missing rate", () => {
    expect(payoutUsdCents(bookingBreakdown({ ...ITEMISED, fx_rate_npr: null }))).toBeNull();
    expect(payoutUsdCents(bookingBreakdown({ ...ITEMISED, guide_payout_npr_paisa: null }))).toBeNull();
  });

  it("survives a row with nothing on it", () => {
    const b = bookingBreakdown({});
    expect(b.lines).toEqual([]);
    expect(b.balances).toBe(true);
    expect(payoutUsdCents(b)).toBeNull();
  });
});
