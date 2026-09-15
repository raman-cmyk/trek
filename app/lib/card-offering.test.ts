import { describe, it, expect } from "vitest";
import { fromPriceFor, toCardOffering } from "./card-offering";

const row = {
  id: "o1",
  slug: "momo",
  kind: "food_culture",
  title: "Kathmandu momo crawl",
  days: 1,
  min_party: 1,
  max_party: 8,
  transport: ["walking"],
  activity_level: "easy",
  cover_photo_url: "https://x/p.jpg",
  guide_slug: "pemba",
  guide_name: "Pemba",
  guide_avatar_url: "https://x/a.jpg",
  guide_tier: 2,
  route_slug: null,
  route_name: null,
  price_usd_cents: 2800,
  price_breakdown: null,
  // The weight a card never reads.
  summary: "A long paragraph ".repeat(40),
  itinerary: [{ day: 1, title: "Thamel" }],
  guide_day_rate_usd_cents: 4000,
};

describe("a row reduced to a card", () => {
  it("keeps what the card draws", () => {
    const c = toCardOffering(row);
    expect(c.title).toBe("Kathmandu momo crawl");
    expect(c.transport).toEqual(["walking"]);
    expect(c.activity_level).toBe("easy");
    expect(c.max_party).toBe(8);
    expect(c.guide_name).toBe("Pemba");
  });

  it("drops the weight it never reads", () => {
    const c = toCardOffering(row) as unknown as Record<string, unknown>;
    expect(c.summary).toBeUndefined();
    expect(c.itinerary).toBeUndefined();
    expect(c.price_breakdown).toBeUndefined();
  });

  it("does not grow when the view gains a column", () => {
    const wider = { ...row, some_new_jsonb_column: { a: 1, b: 2 } };
    expect(Object.keys(toCardOffering(wider))).toEqual(Object.keys(toCardOffering(row)));
  });

  it("carries the price as a number the browser does not recompute", () => {
    expect(toCardOffering(row).from_usd_cents).toBe(2800);
  });
});

describe("the from-price", () => {
  it("is the flat price when there is no breakdown", () => {
    expect(fromPriceFor({ price_usd_cents: 3500, price_breakdown: null })).toBe(3500);
  });

  it("is null rather than zero when there is no price at all", () => {
    expect(fromPriceFor({})).toBeNull();
    expect(fromPriceFor({ price_usd_cents: null })).toBeNull();
  });

  it("prices a breakdown at the largest sensible group", () => {
    const breakdown = {
      guide_fee_total_usd_cents: 100_000,
      permits_usd_cents: 0,
      porters_usd_cents: 0,
      logistics_usd_cents: 0,
      trek_pct: 0.1,
      fund_pct: 0.03,
    } as any;
    const eight = fromPriceFor({ price_breakdown: breakdown, max_party: 8 });
    const two = fromPriceFor({ price_breakdown: breakdown, max_party: 2 });
    expect(eight).not.toBeNull();
    // A group fee split more ways is cheaper each.
    expect(eight!).toBeLessThan(two!);
  });
});
