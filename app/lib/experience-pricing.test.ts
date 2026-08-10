import { describe, it, expect } from "vitest";
import {
  computeExperiencePricing,
  breakdownTotal,
  validateSum,
  fromPerPersonUsdCents,
  type PriceBreakdown,
} from "./experience-pricing";

// EBC-ish: guide fee $378/trip, permits $92, porters $84, logistics $120, 10%/3%.
const bd: PriceBreakdown = {
  guide_fee_total_usd_cents: 37800,
  permits_usd_cents: 9200,
  porters_usd_cents: 8400,
  logistics_usd_cents: 12000,
  trek_pct: 0.1,
  fund_pct: 0.03,
};

describe("experience pricing", () => {
  it("lines always sum to the per-person total (derived, can't disagree)", () => {
    const p = computeExperiencePricing(bd, 1);
    expect(breakdownTotal(p.lines)).toBe(p.perPersonUsdCents);
    expect(validateSum(p.lines, p.perPersonUsdCents).ok).toBe(true);
  });

  it("solo (group 1): guide fee not amortised", () => {
    const p = computeExperiencePricing(bd, 1);
    // base = 378+92+84+120 = 674; trek = 67.4→67; fund = 20.22→20; total = 761
    expect(p.lines[0].amountUsdCents).toBe(37800);
    expect(p.perPersonUsdCents).toBe(37800 + 9200 + 8400 + 12000 + 6740 + 2022);
    expect(p.groupSavingsEachUsdCents).toBe(0);
  });

  it("per-person price drops as the group grows (guide fee split)", () => {
    const solo = computeExperiencePricing(bd, 1).perPersonUsdCents;
    const trio = computeExperiencePricing(bd, 3);
    expect(trio.perPersonUsdCents).toBeLessThan(solo);
    // guide fee split 3 ways
    expect(trio.lines[0].amountUsdCents).toBe(Math.round(37800 / 3));
    // savings each = full guide fee − amortised share
    expect(trio.groupSavingsEachUsdCents).toBe(37800 - Math.round(37800 / 3));
  });

  it("catches a tampered total (never silently normalises)", () => {
    const p = computeExperiencePricing(bd, 2);
    expect(validateSum(p.lines, p.perPersonUsdCents + 100).ok).toBe(false);
  });

  it("`from` price uses the largest sensible group", () => {
    expect(fromPerPersonUsdCents(bd, 4)).toBe(computeExperiencePricing(bd, 4).perPersonUsdCents);
    expect(fromPerPersonUsdCents(bd, 4)).toBeLessThan(computeExperiencePricing(bd, 1).perPersonUsdCents);
  });

  it("dropping the porter recomputes the fee on the smaller base", () => {
    const withPorter = computeExperiencePricing(bd, 2);
    const noPorter = computeExperiencePricing({ ...bd, porters_usd_cents: 0 }, 2);
    expect(noPorter.lines[2].amountUsdCents).toBe(0); // porters line
    expect(noPorter.perPersonUsdCents).toBeLessThan(withPorter.perPersonUsdCents);
    // trek fee (line 4) is smaller because the base shrank — fee follows the package
    expect(noPorter.lines[4].amountUsdCents).toBeLessThan(withPorter.lines[4].amountUsdCents);
  });
});
