import { describe, expect, it } from "vitest";
import { computeExperiencePricing, splitAmounts } from "./experience-pricing";

/**
 * The 500 on /treks/langtang-valley-experience, and the quieter bug behind it.
 *
 * computeExperiencePricing returns lines in two shapes. Priced from rollup
 * totals it returns exactly six, in a fixed order. Priced from a guide's own
 * itemised lines it returns one per line, plus an optional season row, plus
 * our fee and the Fund — a length nobody can predict. The trip page read them
 * as lines[0]…lines[5].
 */

// The real row, copied from production the day it was created.
const ITEMISED: any = {
  days: 12,
  lines: [
    { id: "l0-Guide fe", basis: "group", label: "Guide fee", bucket: "guide", cadence: "day", optional: false, amountUsdCents: 4500 },
    { id: "l1-Permits", basis: "person", label: "Permits", bucket: "permits", cadence: "trip", optional: true, amountUsdCents: 3000 },
    { id: "l2-Teahouse", basis: "group", label: "Teahouse & food", bucket: "logistics", cadence: "trip", optional: true, amountUsdCents: 4500 },
  ],
  fund_pct: 0.03,
  trek_pct: 0.1,
  permits_usd_cents: 0,
  porters_usd_cents: 0,
  logistics_usd_cents: 0,
  guide_fee_total_usd_cents: 0,
};

const ROLLUP: any = {
  days: 14,
  lines: null,
  fund_pct: 0.03,
  trek_pct: 0.1,
  permits_usd_cents: 9200,
  porters_usd_cents: 8400,
  logistics_usd_cents: 12000,
  guide_fee_total_usd_cents: 63000,
};

describe("splitAmounts", () => {
  it("survives the trip that returned a 500", () => {
    const pricing = computeExperiencePricing(ITEMISED, 1, null);
    // Three priced lines: guide, our fee, the Fund. lines[3] does not exist,
    // and `lines[3].amountUsdCents` is what took the page down.
    expect(pricing.lines.length).toBeLessThan(6);
    expect(() => splitAmounts(pricing)).not.toThrow();
  });

  it("puts that trip's money under the right headings", () => {
    const s = splitAmounts(computeExperiencePricing(ITEMISED, 1, null));
    expect(s.guide).toBe(54000); // 4500/day × 12 days
    expect(s.porters).toBe(0);
    expect(s.trek).toBe(5400); // 10%
    expect(s.fund).toBe(1620); // 3%
  });

  it("still reads a rollup-priced trip correctly", () => {
    const p = computeExperiencePricing(ROLLUP, 1, null);
    const s = splitAmounts(p);
    expect(s.guide).toBe(63000);
    expect(s.permits).toBe(9200);
    expect(s.porters).toBe(8400);
    expect(s.logistics).toBe(12000);
  });

  it("adds up to the per-person total, so the bar cannot lie about the sum", () => {
    for (const bd of [ITEMISED, ROLLUP]) {
      const p = computeExperiencePricing(bd, 2, null);
      const s = splitAmounts(p);
      const sum = s.guide + s.permits + s.porters + s.logistics + s.trek + s.fund;
      expect(sum).toBe(p.perPersonUsdCents);
    }
  });

  it("sums several lines that share a bucket instead of showing only one", () => {
    // Reading positionally, a guide who wrote two logistics lines had the
    // second one drawn under whatever heading came next.
    const twoIncluded = {
      ...ITEMISED,
      lines: [
        ...ITEMISED.lines,
        { id: "l3-Jeep", basis: "group", label: "Jeep", bucket: "logistics", cadence: "trip", optional: false, amountUsdCents: 2000 },
        { id: "l4-Lodge", basis: "group", label: "Lodge", bucket: "logistics", cadence: "trip", optional: false, amountUsdCents: 1500 },
      ],
    };
    const s = splitAmounts(computeExperiencePricing(twoIncluded, 1, null));
    expect(s.logistics).toBe(2000 + 1500);
  });

  it("leaves optional extras out of the split, where they belong", () => {
    // On this trip the guide marked Permits and Teahouse as optional, so they
    // are ticked separately and are not part of what the bar divides up.
    const s = splitAmounts(computeExperiencePricing(ITEMISED, 1, null));
    expect(s.permits).toBe(0);
    expect(s.logistics).toBe(0);
  });

  it("never reports a negative or NaN amount", () => {
    const s = splitAmounts(computeExperiencePricing(ITEMISED, 1, null));
    for (const [k, v] of Object.entries(s)) {
      expect(Number.isFinite(v), k).toBe(true);
      expect(v, k).toBeGreaterThanOrEqual(0);
    }
  });
});
