import { describe, expect, it } from "vitest";
import {
  computeExperiencePricing,
  lineScale,
  unitsFor,
  type PriceLine,
  type PriceBreakdown,
} from "./experience-pricing";

const line = (p: Partial<PriceLine>): PriceLine => ({
  id: "l", label: "L", amountUsdCents: 1000, basis: "group",
  cadence: "trip", optional: false, bucket: "logistics", ...p,
});

/**
 * The shape the form could not express.
 *
 * A porter carries about 20 kg — two trekkers' duffels. A jeep seats six. Both
 * costs step with the party rather than sliding, and neither "per person" nor
 * "per group" can say so: priced per person every trekker paid for a whole
 * porter, priced per group a party of twelve was quoted one jeep.
 */
describe("unitsFor", () => {
  const porter = line({ scale: "unit", per: 2, unitLabel: "porter" });

  it("gives one porter to two trekkers, and two to three", () => {
    expect(unitsFor(porter, 1)).toBe(1);
    expect(unitsFor(porter, 2)).toBe(1);
    expect(unitsFor(porter, 3)).toBe(2);
    expect(unitsFor(porter, 4)).toBe(2);
    expect(unitsFor(porter, 5)).toBe(3);
  });

  it("gives a second jeep at seven people", () => {
    const jeep = line({ scale: "unit", per: 6, unitLabel: "vehicle" });
    expect(unitsFor(jeep, 6)).toBe(1);
    expect(unitsFor(jeep, 7)).toBe(2);
    expect(unitsFor(jeep, 12)).toBe(2);
    expect(unitsFor(jeep, 13)).toBe(3);
  });

  it("never returns none of something the trip needs", () => {
    expect(unitsFor(porter, 0)).toBe(1);
    expect(unitsFor(line({ scale: "unit", per: 0 }), 4)).toBe(4);
  });

  it("is 1 for lines that are not units, so nothing else changes", () => {
    expect(unitsFor(line({ basis: "person" }), 8)).toBe(1);
    expect(unitsFor(line({ basis: "group" }), 8)).toBe(1);
  });
});

describe("lineScale reads old breakdowns unchanged", () => {
  it("treats a line with no scale as it always behaved", () => {
    expect(lineScale(line({ basis: "person" }))).toBe("person");
    expect(lineScale(line({ basis: "group" }))).toBe("group");
  });
});

describe("what a party actually pays", () => {
  const bd = (lines: PriceLine[], days = 10): PriceBreakdown =>
    ({ days, lines, trek_pct: 0.1, fund_pct: 0.03,
       guide_fee_total_usd_cents: 0, permits_usd_cents: 0,
       porters_usd_cents: 0, logistics_usd_cents: 0 }) as PriceBreakdown;

  it("charges three trekkers for two porters, not three", () => {
    const porters = line({ id: "p", label: "Porter", amountUsdCents: 2500,
      scale: "unit", per: 2, unitLabel: "porter", cadence: "day", bucket: "porters" });
    const p = computeExperiencePricing(bd([porters]), 3, null);
    const porterLine = p.lines.find((l) => l.label === "Porter")!;
    // $25/day × 10 days × 2 porters = $500, split three ways.
    expect(porterLine.amountUsdCents).toBe(Math.round(2500 * 10 * 2 / 3));
  });

  it("steps the transport when the party outgrows one vehicle", () => {
    const jeep = line({ id: "t", label: "Transport", amountUsdCents: 12000,
      scale: "unit", per: 6, unitLabel: "vehicle", cadence: "trip" });
    const six = computeExperiencePricing(bd([jeep]), 6, null);
    const seven = computeExperiencePricing(bd([jeep]), 7, null);
    const sixTotal = six.perPersonUsdCents * 6;
    const sevenTotal = seven.perPersonUsdCents * 7;
    // One jeep for six, two for seven — the trip's transport bill doubles.
    expect(sevenTotal).toBeGreaterThan(sixTotal * 1.8);
  });

  it("still makes a bigger group cheaper each, which is the whole promise", () => {
    const porters = line({ id: "p", label: "Porter", amountUsdCents: 2500,
      scale: "unit", per: 2, unitLabel: "porter", cadence: "day", bucket: "porters" });
    const guide = line({ id: "g", label: "Guide fee", amountUsdCents: 4500,
      cadence: "day", bucket: "guide" });
    const solo = computeExperiencePricing(bd([guide, porters]), 1, null).perPersonUsdCents;
    const four = computeExperiencePricing(bd([guide, porters]), 4, null).perPersonUsdCents;
    expect(four).toBeLessThan(solo);
  });

  it("prices a per-person line exactly as before", () => {
    const permits = line({ id: "x", label: "Permits", amountUsdCents: 3000,
      basis: "person", cadence: "trip", bucket: "permits" });
    const p = computeExperiencePricing(bd([permits]), 5, null);
    expect(p.lines.find((l) => l.label === "Permits")!.amountUsdCents).toBe(3000);
  });

  it("leaves a breakdown written before any of this priced the same", () => {
    const old = line({ id: "o", label: "Teahouse", amountUsdCents: 2000,
      basis: "person", cadence: "day", bucket: "logistics" });
    const p = computeExperiencePricing(bd([old], 7), 3, null);
    expect(p.lines.find((l) => l.label === "Teahouse")!.amountUsdCents).toBe(2000 * 7);
  });
});
