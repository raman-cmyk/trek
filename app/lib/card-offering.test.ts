import { describe, expect, it } from "vitest";
import { toCardOffering } from "./card-offering";
import { listPriceUsdCents } from "./list-price";

const FULL: any = {
  id: "o1",
  slug: "ebc",
  kind: "trek",
  title: "Everest Base Camp",
  summary: "A long paragraph nobody's card has ever rendered.".repeat(6),
  days: 14,
  price_usd_cents: 114800,
  price_breakdown: {
    guide_fee_total_usd_cents: 63000,
    trek_pct: 0.1,
    fund_pct: 0.03,
    lines: Array.from({ length: 12 }, (_, i) => ({ id: `l${i}`, label: `Line ${i}`, amountUsdCents: 1000 })),
  },
  max_party: 8,
  min_party: 1,
  cover_photo_url: "/img/ebc.jpg",
  guide_id: "g1",
  guide_slug: "pemba",
  guide_name: "Pemba",
  guide_avatar_url: "/img/pemba.jpg",
  guide_tier: 3,
  guide_day_rate_usd_cents: 4500,
  guide_years_experience: 14,
  route_slug: "everest-base-camp",
  route_name: "Everest Base Camp",
};

describe("toCardOffering", () => {
  it("quotes the same price the untrimmed row would have", () => {
    // The whole point: the browser stops receiving a price_breakdown, and the
    // number does not move. If these ever disagree, a card and its trip page
    // disagree, which is the bug this replaced on the cards.
    expect(toCardOffering(FULL).from_usd_cents).toBe(listPriceUsdCents(FULL));
  });

  it("drops the two fields that made the payload heavy", () => {
    const card = toCardOffering(FULL) as any;
    expect(card.summary).toBeUndefined();
    expect(card.price_breakdown).toBeUndefined();
  });

  it("is dramatically smaller on the wire", () => {
    const before = JSON.stringify(FULL).length;
    const after = JSON.stringify(toCardOffering(FULL)).length;
    expect(after).toBeLessThan(before / 2);
  });

  it("keeps everything a card actually draws", () => {
    const c = toCardOffering(FULL);
    for (const k of [
      "id", "slug", "kind", "title", "days", "cover_photo_url",
      "guide_slug", "guide_name", "guide_avatar_url", "guide_tier",
      "guide_years_experience", "route_slug", "route_name",
    ] as const) {
      expect(c[k], k).toBeDefined();
    }
  });

  it("carries guide_id, which the grid needs to look up a rating", () => {
    expect(toCardOffering(FULL).guide_id).toBe("g1");
  });

  it("gives a trip with no price a null rather than a zero", () => {
    const none = toCardOffering({ ...FULL, price_usd_cents: null, price_breakdown: null });
    expect(none.from_usd_cents).toBeNull();
  });

  it("prices a flat-rate day experience from its own price", () => {
    const day = toCardOffering({
      ...FULL, kind: "food_culture", days: 1, price_usd_cents: 2800, price_breakdown: null,
    });
    expect(day.from_usd_cents).toBe(2800);
  });
});
