import { describe, expect, it } from "vitest";
import {
  addOns,
  computeExperiencePricing,
  hasBreakdown,
  fromPerPersonUsdCents,
  partyAmounts,
  recompose,
  seasonFor,
  type PriceBreakdown,
  type PriceLine,
} from "./experience-pricing";

/**
 * The line-item price. A fourteen-day trek and a three-hour walk cannot share
 * four fixed slots, so a breakdown may carry as many lines as the trip has.
 *
 * These assert the two things that must never drift: the per-person total is
 * exactly the sum of what is shown, and the whole-party amounts a booking
 * records still add up to what the traveller was charged.
 */

const line = (p: Partial<PriceLine> & { id: string; amountUsdCents: number }): PriceLine => ({
  label: p.id,
  basis: "person",
  cadence: "trip",
  optional: false,
  bucket: "logistics",
  ...p,
});

/** A 10-day trek: guide fee per day for the group, food per person per day,
    permits once per person, and a gear add-on nobody has chosen. */
const trek: PriceBreakdown = {
  guide_fee_total_usd_cents: 0,
  permits_usd_cents: 0,
  porters_usd_cents: 0,
  logistics_usd_cents: 0,
  trek_pct: 0.1,
  fund_pct: 0.03,
  days: 10,
  lines: [
    line({ id: "guide", label: "Guide fee", amountUsdCents: 4000, basis: "group", cadence: "day", bucket: "guide" }),
    line({ id: "food", label: "Teahouse & food", amountUsdCents: 2500, cadence: "day" }),
    line({ id: "permits", label: "Permits", amountUsdCents: 5000, bucket: "permits" }),
    line({ id: "gear", label: "Gear hire", amountUsdCents: 3000, optional: true }),
  ],
};

const legacy: PriceBreakdown = {
  guide_fee_total_usd_cents: 40000,
  permits_usd_cents: 5000,
  porters_usd_cents: 8000,
  logistics_usd_cents: 25000,
  trek_pct: 0.1,
  fund_pct: 0.03,
};

describe("hasBreakdown", () => {
  it("is true for either shape and false for neither", () => {
    expect(hasBreakdown(legacy)).toBe(true);
    expect(hasBreakdown(trek)).toBe(true);
    expect(hasBreakdown(null)).toBe(false);
    // A line-item price whose lines are all zero is not a price.
    expect(hasBreakdown({ ...trek, lines: [line({ id: "a", amountUsdCents: 0 })] })).toBe(false);
    // The legacy test this replaced: guide fee zero used to mean "no price",
    // which is exactly wrong for a day walk with no guide-fee line.
    expect(hasBreakdown({ ...legacy, guide_fee_total_usd_cents: 0 })).toBe(false);
  });
});

describe("line-item pricing", () => {
  it("multiplies per-day lines by the trip length", () => {
    const p = computeExperiencePricing(trek, 1);
    // Food: $25/day × 10 days, per person.
    expect(p.lines.find((l) => l.key === "line:food")!.amountUsdCents).toBe(25000);
    // Permits: once, not ten times.
    expect(p.lines.find((l) => l.key === "line:permits")!.amountUsdCents).toBe(5000);
  });

  it("divides per-group lines across the party and leaves per-person lines alone", () => {
    const solo = computeExperiencePricing(trek, 1);
    const four = computeExperiencePricing(trek, 4);
    const g = (p: typeof solo, k: string) => p.lines.find((l) => l.key === k)!.amountUsdCents;
    // Guide fee $40/day × 10 = $400 for the group: $400 solo, $100 each at four.
    expect(g(solo, "line:guide")).toBe(40000);
    expect(g(four, "line:guide")).toBe(10000);
    // Food and permits do not move.
    expect(g(four, "line:food")).toBe(g(solo, "line:food"));
    expect(g(four, "line:permits")).toBe(g(solo, "line:permits"));
  });

  it("keeps the guide's own labels", () => {
    const p = computeExperiencePricing(trek, 2);
    expect(p.lines.map((l) => l.label)).toEqual([
      "Guide fee",
      "Teahouse & food",
      "Permits",
      "Trek fee (10%)",
      "The Fund (3%)",
    ]);
  });

  it("adds our 10% and the 3% Fund on top of the guide's lines, not inside them", () => {
    const p = computeExperiencePricing(trek, 2);
    const own = p.lines.filter((l) => l.key.startsWith("line:"));
    const base = own.reduce((s, l) => s + l.amountUsdCents, 0);
    expect(p.lines.find((l) => l.key === "trek")!.amountUsdCents).toBe(Math.round(base * 0.1));
    expect(p.lines.find((l) => l.key === "fund")!.amountUsdCents).toBe(Math.round(base * 0.03));
  });

  it("the total is exactly the sum of the lines shown", () => {
    for (const g of [1, 2, 4, 6]) {
      const p = computeExperiencePricing(trek, g);
      expect(p.perPersonUsdCents).toBe(
        p.lines.reduce((s, l) => s + l.amountUsdCents, 0),
      );
    }
  });

  it("gets cheaper per person as the group grows, and never below the per-person floor", () => {
    const at = (g: number) => computeExperiencePricing(trek, g).perPersonUsdCents;
    expect(at(1)).toBeGreaterThan(at(2));
    expect(at(2)).toBeGreaterThan(at(4));
    expect(at(4)).toBeGreaterThan(at(6));
    // Food + permits alone, plus our percentages, is the floor.
    const floor = Math.round((25000 + 5000) * 1.13);
    expect(at(1000)).toBeGreaterThanOrEqual(floor - 2);
  });

  it("leaves optional lines out of the headline and offers them separately", () => {
    const p = computeExperiencePricing(trek, 2);
    expect(p.lines.some((l) => l.key === "line:gear")).toBe(false);
    expect(addOns(trek, 2)).toEqual([
      { id: "gear", label: "Gear hire", perPersonUsdCents: 3000 },
    ]);
  });

  it("reports what the group saves each against going alone", () => {
    const four = computeExperiencePricing(trek, 4);
    // Guide fee is the only per-group line: $400 solo vs $100 each.
    expect(four.groupSavingsEachUsdCents).toBe(30000);
  });
});

describe("booking snapshot", () => {
  it("sums whole-party amounts by bucket, and they add to what is charged", () => {
    for (const g of [1, 2, 4, 6]) {
      const a = partyAmounts(trek, g);
      const parts =
        a.guideUsdCents +
        a.permitsUsdCents +
        a.portersUsdCents +
        a.logisticsUsdCents +
        a.trekUsdCents +
        a.fundUsdCents;
      expect(parts).toBe(a.totalUsdCents);
      expect(a.totalUsdCents).toBe(computeExperiencePricing(trek, g).perPersonUsdCents * g);
    }
  });

  it("puts each line in the column its bucket names", () => {
    const a = partyAmounts(trek, 2);
    expect(a.guideUsdCents).toBe(20000 * 2); // $400 group fee, halved, ×2 people
    expect(a.permitsUsdCents).toBe(5000 * 2);
    expect(a.logisticsUsdCents).toBe(25000 * 2); // food
    expect(a.portersUsdCents).toBe(0);
  });

  it("still reconciles for a legacy four-slot breakdown", () => {
    const a = partyAmounts(legacy, 3);
    const parts =
      a.guideUsdCents + a.permitsUsdCents + a.portersUsdCents +
      a.logisticsUsdCents + a.trekUsdCents + a.fundUsdCents;
    expect(parts).toBe(a.totalUsdCents);
  });
});

describe("budget levers on a line-item price", () => {
  it("cuts the logistics lines and drops the porter", () => {
    const withPorter: PriceBreakdown = {
      ...trek,
      lines: [...trek.lines!, line({ id: "porter", amountUsdCents: 1500, cadence: "day", bucket: "porters" })],
    };
    const basic = recompose(withPorter, { tier: "basic", porter: false });
    const food = basic.lines!.find((l) => l.id === "food")!;
    const porter = basic.lines!.find((l) => l.id === "porter")!;
    expect(food.amountUsdCents).toBe(Math.round(2500 * 0.6));
    expect(porter.amountUsdCents).toBe(0);
    // The guide's fee is untouched by a teahouse choice.
    expect(basic.lines!.find((l) => l.id === "guide")!.amountUsdCents).toBe(4000);
  });
});

/** A season recurs, so it is stored as month-day and matched that way. */
const seasonal: PriceBreakdown = {
  ...trek,
  seasons: [
    { id: "peak", label: "October peak", from: "10-01", to: "11-15", pct: 0.2 },
    { id: "monsoon", label: "Monsoon", from: "06-01", to: "08-31", pct: -0.25 },
    { id: "winter", label: "Deep winter", from: "12-15", to: "02-10", pct: -0.1 },
  ],
};

describe("seasonal pricing", () => {
  it("matches a date to its season, in any year", () => {
    expect(seasonFor(seasonal, "2026-10-20")?.id).toBe("peak");
    expect(seasonFor(seasonal, "2031-10-20")?.id).toBe("peak");
    expect(seasonFor(seasonal, "2026-07-04")?.id).toBe("monsoon");
    expect(seasonFor(seasonal, "2026-04-15")).toBeNull();
  });

  it("matches a season that wraps the year end", () => {
    expect(seasonFor(seasonal, "2026-12-28")?.id).toBe("winter");
    expect(seasonFor(seasonal, "2027-01-30")?.id).toBe("winter");
    expect(seasonFor(seasonal, "2026-11-30")).toBeNull();
  });

  it("takes the boundary days themselves", () => {
    expect(seasonFor(seasonal, "2026-10-01")?.id).toBe("peak");
    expect(seasonFor(seasonal, "2026-11-15")?.id).toBe("peak");
    expect(seasonFor(seasonal, "2026-11-16")).toBeNull();
  });

  it("shows the uplift as its own line and never inside another", () => {
    const off = computeExperiencePricing(seasonal, 2);
    const peak = computeExperiencePricing(seasonal, 2, "2026-10-20");
    const named = peak.lines.find((l) => l.key === "season:peak");
    expect(named?.label).toBe("October peak (+20%)");
    // Every line the guide wrote is unchanged; only the new line differs.
    for (const l of off.lines.filter((x) => x.key.startsWith("line:"))) {
      expect(peak.lines.find((x) => x.key === l.key)!.amountUsdCents).toBe(l.amountUsdCents);
    }
    const ownTotal = off.lines
      .filter((l) => l.key.startsWith("line:"))
      .reduce((s, l) => s + l.amountUsdCents, 0);
    expect(named!.amountUsdCents).toBe(Math.round(ownTotal * 0.2));
  });

  it("prices a discount season down", () => {
    const wet = computeExperiencePricing(seasonal, 2, "2026-07-04");
    const off = computeExperiencePricing(seasonal, 2);
    expect(wet.perPersonUsdCents).toBeLessThan(off.perPersonUsdCents);
    expect(wet.lines.find((l) => l.key === "season:monsoon")!.amountUsdCents).toBeLessThan(0);
  });

  it("charges our percentages on the seasonal price, not the base", () => {
    const peak = computeExperiencePricing(seasonal, 2, "2026-10-20");
    const base = peak.lines
      .filter((l) => l.key.startsWith("line:") || l.key.startsWith("season:"))
      .reduce((s, l) => s + l.amountUsdCents, 0);
    expect(peak.lines.find((l) => l.key === "trek")!.amountUsdCents).toBe(Math.round(base * 0.1));
    expect(peak.lines.find((l) => l.key === "fund")!.amountUsdCents).toBe(Math.round(base * 0.03));
  });

  it("the total is still exactly the sum of the lines shown", () => {
    for (const d of ["2026-10-20", "2026-07-04", "2026-04-15", "2027-01-30"]) {
      for (const g of [1, 2, 4]) {
        const p = computeExperiencePricing(seasonal, g, d);
        expect(p.perPersonUsdCents).toBe(p.lines.reduce((s, l) => s + l.amountUsdCents, 0));
      }
    }
  });

  it("a booking records the seasonal amounts, and they still reconcile", () => {
    for (const d of ["2026-10-20", "2026-07-04", null]) {
      const a = partyAmounts(seasonal, 3, d);
      const parts =
        a.guideUsdCents + a.permitsUsdCents + a.portersUsdCents +
        a.logisticsUsdCents + a.trekUsdCents + a.fundUsdCents;
      expect(parts).toBe(a.totalUsdCents);
      expect(a.totalUsdCents).toBe(computeExperiencePricing(seasonal, 3, d).perPersonUsdCents * 3);
    }
    // And peak really does cost the party more than the shoulder.
    expect(partyAmounts(seasonal, 3, "2026-10-20").totalUsdCents).toBeGreaterThan(
      partyAmounts(seasonal, 3, "2026-04-15").totalUsdCents,
    );
  });

  it("'from' quotes the cheapest the year offers, not the shoulder price", () => {
    const from = fromPerPersonUsdCents(seasonal, 4);
    const monsoon = computeExperiencePricing(seasonal, 4, "2026-07-04").perPersonUsdCents;
    expect(from).toBe(monsoon);
  });

  it("leaves an offering with no seasons exactly as it was", () => {
    for (const g of [1, 2, 4]) {
      expect(computeExperiencePricing(trek, g, "2026-10-20").perPersonUsdCents).toBe(
        computeExperiencePricing(trek, g).perPersonUsdCents,
      );
    }
  });
});
