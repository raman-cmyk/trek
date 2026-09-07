import { describe, it, expect } from "vitest";
import { composePackage, describeChanges, optionsOf, priceMove } from "./packages";
import { partyAmounts, type PriceBreakdown, type PriceLine } from "./experience-pricing";

const line = (over: Partial<PriceLine>): PriceLine => ({
  id: "l1",
  label: "Line",
  amountUsdCents: 10000,
  basis: "person",
  cadence: "trip",
  optional: false,
  bucket: "logistics",
  ...over,
});

const BASE: PriceBreakdown = {
  guide_fee_total_usd_cents: 0,
  permits_usd_cents: 0,
  porters_usd_cents: 0,
  logistics_usd_cents: 0,
  trek_pct: 0.1,
  fund_pct: 0.03,
  days: 14,
  lines: [
    line({ id: "guide", label: "Guide fee", basis: "group", cadence: "day", amountUsdCents: 3500, bucket: "guide" }),
    line({ id: "food", label: "Teahouse & food", cadence: "day", amountUsdCents: 3000 }),
    line({ id: "gear", label: "Gear hire", optional: true, amountUsdCents: 6000 }),
    line({ id: "acc", label: "Extra acclimatisation day", optional: true, amountUsdCents: 12000 }),
  ],
};

describe("composing the package that is actually sold", () => {
  it("drops the options nobody ticked and keeps the ones they did", () => {
    const p = composePackage(BASE, { days: 14, includedOptionIds: ["gear"] });
    expect(p.lines!.map((l) => l.id)).toEqual(["guide", "food", "gear"]);
  });

  it("makes a chosen option part of the price, not an extra", () => {
    // An optional line is excluded from the headline everywhere else, so one
    // that stays optional after being chosen is one nobody gets charged for.
    const p = composePackage(BASE, { days: 14, includedOptionIds: ["gear"] });
    expect(p.lines!.find((l) => l.id === "gear")!.optional).toBe(false);
    expect(partyAmounts(p, 2, null).totalUsdCents).toBeGreaterThan(
      partyAmounts(composePackage(BASE, { days: 14, includedOptionIds: [] }), 2, null).totalUsdCents,
    );
  });

  it("re-prices the per-day lines when the trip gets longer", () => {
    const two = partyAmounts(composePackage(BASE, { days: 14, includedOptionIds: [] }), 2, null);
    const longer = partyAmounts(composePackage(BASE, { days: 16, includedOptionIds: [] }), 2, null);
    expect(longer.totalUsdCents).toBeGreaterThan(two.totalUsdCents);
    // Two more days of guide fee and food, plus the percentages on top.
    expect(longer.totalUsdCents - two.totalUsdCents).toBeGreaterThan(2 * 3000);
  });

  it("carries a line the guide wrote for this trip only", () => {
    const p = composePackage(BASE, {
      days: 14,
      includedOptionIds: [],
      extraLines: [line({ id: "heli", label: "Helicopter out from Lukla", amountUsdCents: 45000 })],
    });
    expect(p.lines!.at(-1)!.label).toBe("Helicopter out from Lukla");
    // …and never writes it back into the offering it was composed from.
    expect(BASE.lines!.some((l) => l.id === "heli")).toBe(false);
    expect(BASE.days).toBe(14);
  });

  it("never lets a negative amount in through an extra line", () => {
    const p = composePackage(BASE, {
      days: 14,
      includedOptionIds: [],
      extraLines: [line({ id: "x", label: "Oops", amountUsdCents: -5000 })],
    });
    expect(p.lines!.at(-1)!.amountUsdCents).toBe(0);
  });

  it("lists the options a trekker can tick", () => {
    expect(optionsOf(BASE).map((l) => l.id)).toEqual(["gear", "acc"]);
    expect(optionsOf(null)).toEqual([]);
  });
});

describe("saying what changed", () => {
  const before = { days: 14, partySize: 2, startDate: "2026-10-01", optionIds: ["gear"] };

  it("says a longer trip in days, both ways round", () => {
    expect(describeChanges(before, { ...before, days: 15 })[0]).toBe(
      "1 day longer — 15 days instead of 14",
    );
    expect(describeChanges(before, { ...before, days: 12 })[0]).toBe(
      "2 days shorter — 12 days instead of 14",
    );
  });

  it("names what was added and what was taken out", () => {
    const labels: Record<string, string> = { gear: "Gear hire", acc: "Extra acclimatisation day" };
    const out = describeChanges(before, { ...before, optionIds: ["acc"] }, (id) => labels[id] ?? id);
    expect(out).toContain("Added: Extra acclimatisation day");
    expect(out).toContain("Removed: Gear hire");
  });

  it("says nothing when nothing moved", () => {
    expect(describeChanges(before, { ...before })).toEqual([]);
  });

  it("reports the price moving in the direction people care about", () => {
    expect(priceMove(100000, 112000)).toEqual({ direction: "up", diffUsdCents: 12000 });
    expect(priceMove(100000, 90000)).toEqual({ direction: "down", diffUsdCents: 10000 });
    expect(priceMove(100000, 100000).direction).toBe("same");
  });
});
