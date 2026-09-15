import { describe, it, expect } from "vitest";
import { computeExperiencePricing, type PriceBreakdown } from "./experience-pricing";
import { listPriceUsdCents, openingParty } from "./list-price";

// Pemba's Everest trek, as the database holds it: a $630 guide fee for the
// whole party, a trip that takes from one person to eight.
const ebc: PriceBreakdown = {
  guide_fee_total_usd_cents: 63_000,
  permits_usd_cents: 3_800,
  porters_usd_cents: 0,
  logistics_usd_cents: 0,
  trek_pct: 0.1,
  fund_pct: 0.03,
};

describe("the card and the page agree", () => {
  it("prices at the party the page opens with, not a group of four", () => {
    const o = { price_breakdown: ebc, min_party: 1, max_party: 8 };
    const card = listPriceUsdCents(o);
    const page = computeExperiencePricing(ebc, 1).perPersonUsdCents;
    expect(card).toBe(page);
  });

  it("is the whole guide fee when one person books, not a quarter of it", () => {
    const solo = listPriceUsdCents({ price_breakdown: ebc, min_party: 1 })!;
    const four = computeExperiencePricing(ebc, 4).perPersonUsdCents;
    // The bug: the card showed the four-person figure on a trip somebody
    // books alone. It is a different number by hundreds of dollars.
    expect(solo).toBeGreaterThan(four * 2);
  });

  it("follows a trip whose minimum is bigger than one", () => {
    const o = { price_breakdown: ebc, min_party: 2 };
    expect(listPriceUsdCents(o)).toBe(computeExperiencePricing(ebc, 2).perPersonUsdCents);
  });

  it("uses the flat price when a trip has no breakdown", () => {
    expect(listPriceUsdCents({ price_usd_cents: 2_800, price_breakdown: null })).toBe(2_800);
  });

  it("is null, not zero, when a trip has no price — a card must not read as free", () => {
    expect(listPriceUsdCents({})).toBeNull();
    expect(listPriceUsdCents({ price_usd_cents: null })).toBeNull();
  });
});

describe("the opening party", () => {
  it("is the trip's minimum", () => {
    expect(openingParty({ min_party: 4 })).toBe(4);
  });

  it("falls back to one rather than to nonsense", () => {
    expect(openingParty({})).toBe(1);
    expect(openingParty({ min_party: 0 })).toBe(1);
    expect(openingParty({ min_party: null })).toBe(1);
  });
});
