import { describe, expect, it } from "vitest";
import {
  angleOf,
  echoesGuide,
  groupOfferings,
  NO_ROUTE_LABEL,
  optionLabel,
  priceOf,
  type PickableOffering,
} from "./offering-picker";

const money = (c: number) => `$${Math.round(c / 100)}`;

const o = (over: Partial<PickableOffering>): PickableOffering => ({
  id: "x",
  title: "A trip",
  days: 1,
  guide_name: "Somebody",
  route_name: null,
  price_usd_cents: 1000,
  ...over,
});

describe("angleOf", () => {
  it("keeps only what the guide added to the route's name", () => {
    expect(angleOf("Everest Base Camp at porter pace", "Everest Base Camp")).toBe(
      "at porter pace",
    );
    expect(angleOf("Annapurna Circuit, ending in Mustang", "Annapurna Circuit")).toBe(
      "ending in Mustang",
    );
    expect(angleOf("Manaslu Circuit — the far side", "Manaslu Circuit")).toBe("the far side");
  });

  it("does not care about case", () => {
    expect(angleOf("everest base camp on a budget", "Everest Base Camp")).toBe("on a budget");
  });

  it("leaves a title that is not the route alone", () => {
    // A guide who named their trip something else meant it.
    expect(angleOf("Three weeks the long way round", "Annapurna Circuit")).toBe(
      "Three weeks the long way round",
    );
  });

  it("is empty when the title is exactly the route", () => {
    // Nothing added, so nothing to say — the heading already said it.
    expect(angleOf("Langtang Valley", "Langtang Valley")).toBe("");
  });

  it("survives a missing route or title", () => {
    expect(angleOf("Kathmandu momo crawl", null)).toBe("Kathmandu momo crawl");
    expect(angleOf("", "Langtang Valley")).toBe("");
  });
});

describe("priceOf", () => {
  it("prefers the itemised breakdown over the flat column", () => {
    const priced = o({
      price_usd_cents: 999999,
      max_party: 2,
      price_breakdown: {
        guide_fee_total_usd_cents: 40000,
        permits_usd_cents: 0,
        porters_usd_cents: 0,
        logistics_usd_cents: 0,
        trek_pct: 0,
        fund_pct: 0,
      },
    });
    expect(priceOf(priced)).toBe(20000);
  });

  it("falls back to the flat price, and to nothing at all", () => {
    expect(priceOf(o({ price_usd_cents: 6420 }))).toBe(6420);
    expect(priceOf(o({ price_usd_cents: null }))).toBeNull();
  });
});

describe("groupOfferings", () => {
  const list: PickableOffering[] = [
    o({ id: "a", title: "Annapurna Circuit off the road", route_name: "Annapurna Circuit", guide_name: "Bishnu", days: 16, price_usd_cents: 64200 }),
    o({ id: "b", title: "Annapurna Circuit with a Manangi", route_name: "Annapurna Circuit", guide_name: "Dil", days: 17, price_usd_cents: 70800 }),
    o({ id: "c", title: "Annapurna Circuit, the quiet way", route_name: "Annapurna Circuit", guide_name: "Tashi", days: 16, price_usd_cents: 62800 }),
    o({ id: "d", title: "Everest Base Camp on a budget", route_name: "Everest Base Camp", guide_name: "Maya", days: 14, price_usd_cents: 54300 }),
    o({ id: "e", title: "Kathmandu momo crawl", route_name: null, guide_name: "Pemba", days: 1, price_usd_cents: 3000 }),
  ];

  it("puts every version of one trek under that trek", () => {
    const groups = groupOfferings(list);
    expect(groups.map((g) => g.label)).toEqual([
      "Annapurna Circuit",
      "Everest Base Camp",
      NO_ROUTE_LABEL,
    ]);
    expect(groups[0].options).toHaveLength(3);
  });

  it("sends day trips to the end, where a different decision lives", () => {
    expect(groupOfferings(list).at(-1)!.label).toBe(NO_ROUTE_LABEL);
  });

  it("orders the guides within a trek by price, cheapest first", () => {
    const annapurna = groupOfferings(list)[0];
    expect(annapurna.options.map((x) => x.guideName)).toEqual(["Tashi", "Bishnu", "Dil"]);
  });

  it("puts an unpriced trip last, not first", () => {
    // A missing number at the top of a cheapest-first list reads as free.
    const groups = groupOfferings([
      ...list,
      o({ id: "f", title: "Annapurna Circuit, ask me", route_name: "Annapurna Circuit", guide_name: "Ang", price_usd_cents: null }),
    ]);
    expect(groups[0].options.at(-1)!.guideName).toBe("Ang");
  });

  it("keeps a day trip's whole title, since it has no heading to lean on", () => {
    const day = groupOfferings(list).at(-1)!.options[0];
    expect(day.angle).toBe("Kathmandu momo crawl");
  });

  it("handles an empty list", () => {
    expect(groupOfferings([])).toEqual([]);
  });
});

describe("optionLabel", () => {
  it("leads with the guide — that is what is being chosen", () => {
    const [group] = groupOfferings([
      o({ id: "a", title: "Everest Base Camp at porter pace", route_name: "Everest Base Camp", guide_name: "Bishnu", days: 16, price_usd_cents: 64200 }),
    ]);
    expect(optionLabel(group.options[0], money)).toBe(
      "with Bishnu · at porter pace · 16 days · from $642 pp",
    );
  });

  it("drops the parts that would be empty rather than printing separators", () => {
    expect(
      optionLabel(
        { id: "x", guideName: "Sunita", days: null, angle: "", fromUsdCents: null },
        money,
      ),
    ).toBe("with Sunita");
  });

  it("says day, not days, for a one-day trip", () => {
    expect(
      optionLabel({ id: "x", guideName: "Pemba", days: 1, angle: "", fromUsdCents: 3000 }, money),
    ).toBe("with Pemba · 1 day · from $30 pp");
  });
});

describe("echoesGuide", () => {
  it("catches a title that only repeats the guide's name", () => {
    // "Annapurna Circuit with Sunita" under Annapurna Circuit left "with
    // Sunita", printed beside "with Sunita".
    expect(echoesGuide("with Sunita", "Sunita Gurung")).toBe(true);
    expect(echoesGuide("Sunita", "Sunita Gurung")).toBe(true);
    expect(echoesGuide("with Pemba Sherpa", "Pemba Sherpa")).toBe(true);
  });

  it("keeps an angle that says something", () => {
    expect(echoesGuide("with a Manangi", "Dil Gurung")).toBe(false);
    expect(echoesGuide("with a Namche local", "Nawang Sherpa")).toBe(false);
    expect(echoesGuide("at porter pace", "Ang Sherpa")).toBe(false);
  });

  it("is false when there is nothing to compare", () => {
    expect(echoesGuide("", "Sunita")).toBe(false);
    expect(echoesGuide("with Sunita", "")).toBe(false);
  });
});

describe("optionLabel with a self-naming title", () => {
  it("says the guide once", () => {
    expect(
      optionLabel(
        { id: "x", guideName: "Sunita", days: 15, angle: "with Sunita", fromUsdCents: 60600 },
        money,
      ),
    ).toBe("with Sunita · 15 days · from $606 pp");
  });
});
