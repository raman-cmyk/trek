import { describe, expect, it } from "vitest";
import {
  gradeLevel,
  groupByRegion,
  isRange,
  lengthOf,
  lengthsOf,
  matches,
  monthsOf,
  resultHeading,
  priceSpread,
  profileOf,
  profilePath,
  regionsOf,
  seasonLabel,
  sortCards,
  type Card,
} from "./route-cards";

const LANGTANG = [
  { day: 0, place: "Syabrubesi", altitude_m: 1460 },
  { day: 1, place: "Lama Hotel", altitude_m: 2470 },
  { day: 2, place: "Langtang village", altitude_m: 3430 },
  { day: 3, place: "Kyanjin Gompa", altitude_m: 3870 },
  { day: 4, place: "Kyanjin Ri", altitude_m: 4773 },
  { day: 5, place: "Lama Hotel", altitude_m: 2470 },
  { day: 6, place: "Syabrubesi", altitude_m: 1460 },
];

describe("profileOf", () => {
  it("normalises against the route's own low and high", () => {
    const p = profileOf(LANGTANG)!;
    expect(p.lowest).toBe(1460);
    expect(p.highest).toBe(4773);
    expect(p.points[0].v).toBe(0);
    expect(p.points[4].v).toBe(1);
    expect(p.summit).toBe(4);
  });

  it("spreads the stops evenly from 0 to 1", () => {
    const p = profileOf(LANGTANG)!;
    expect(p.points[0].t).toBe(0);
    expect(p.points[6].t).toBe(1);
  });

  it("keeps the day and the place on each point", () => {
    const p = profileOf(LANGTANG)!;
    expect(p.points[4]).toMatchObject({ day: 4, place: "Kyanjin Ri", altitude_m: 4773 });
  });

  it("is nothing at all when there is nothing to draw", () => {
    expect(profileOf([])).toBeNull();
    expect(profileOf(null)).toBeNull();
    expect(profileOf([{ day: 1, place: "One stop", altitude_m: 2000 }])).toBeNull();
    // Altitudes that were never filled in are not a flat walk, they are no data.
    expect(profileOf([
      { day: 1, place: "a", altitude_m: 0 },
      { day: 2, place: "b", altitude_m: 0 },
    ])).toBeNull();
  });

  it("survives a route where every stop sits at the same height", () => {
    const p = profileOf([
      { day: 1, place: "a", altitude_m: 2000 },
      { day: 2, place: "b", altitude_m: 2000 },
    ])!;
    expect(p.points.every((pt) => pt.v === 0)).toBe(true);
  });
});

describe("profilePath", () => {
  it("draws a line across the box and closes the area at the bottom", () => {
    const p = profileOf(LANGTANG)!;
    const { line, area, summit } = profilePath(p, 600, 100);
    expect(line.startsWith("M8.0,")).toBe(true);
    expect(area.endsWith("Z")).toBe(true);
    expect(area).toContain("L8.0,100");
    // The summit marker sits at the top padding, on the highest stop.
    expect(summit.y).toBeCloseTo(16, 1);
    expect(summit.x).toBeGreaterThan(8);
    expect(summit.x).toBeLessThan(592);
  });
});

describe("priceSpread", () => {
  const o = (guide: string, cents: number | null) => ({
    route_id: "r",
    guide_id: guide,
    price_usd_cents: cents,
  });

  it("is the low and the high across every guide's price", () => {
    expect(priceSpread([o("a", 39800), o("b", 54000), o("c", 44000)])).toEqual({
      lo: 39800,
      hi: 54000,
      guides: 3,
    });
  });

  it("counts guides, not offerings", () => {
    expect(priceSpread([o("a", 100), o("a", 200)]).guides).toBe(1);
  });

  it("has no price when nobody has set one, and still counts the guides", () => {
    expect(priceSpread([o("a", null), o("b", 0)])).toEqual({ lo: null, hi: null, guides: 2 });
  });

  it("is empty for a route nobody lists", () => {
    expect(priceSpread([])).toEqual({ lo: null, hi: null, guides: 0 });
  });

  it("prefers the breakdown's per-person total over the flat price", () => {
    // The $400 guide fee, not the $9,999.99 sitting in the flat column from
    // before the breakdown existed. This trip has no minimum, so its page
    // opens at one person and that is the figure a reader will be quoted —
    // the range used to show the two-person split and then charge double.
    const s = priceSpread([
      {
        route_id: "r",
        guide_id: "a",
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
      },
    ]);
    expect(s.lo).toBe(40000);
  });

  it("splits the fee when the trip cannot be walked alone", () => {
    const s = priceSpread([
      {
        route_id: "r",
        guide_id: "a",
        price_usd_cents: null,
        min_party: 2,
        max_party: 4,
        price_breakdown: {
          guide_fee_total_usd_cents: 40000,
          permits_usd_cents: 0,
          porters_usd_cents: 0,
          logistics_usd_cents: 0,
          trek_pct: 0,
          fund_pct: 0,
        },
      },
    ]);
    expect(s.lo).toBe(20000);
  });
});

describe("isRange", () => {
  it("is a range only when the ends are a dollar or more apart", () => {
    expect(isRange({ lo: 39800, hi: 54000, guides: 3 })).toBe(true);
    expect(isRange({ lo: 39800, hi: 39850, guides: 2 })).toBe(false);
    expect(isRange({ lo: 39800, hi: 39800, guides: 1 })).toBe(false);
    expect(isRange({ lo: null, hi: null, guides: 0 })).toBe(false);
  });
});

describe("seasonLabel", () => {
  it("compresses runs of months", () => {
    expect(seasonLabel([3, 4, 5, 10, 11])).toBe("Mar–May · Oct–Nov");
    expect(seasonLabel([5])).toBe("May");
    expect(seasonLabel([])).toBe("");
    expect(seasonLabel(null)).toBe("");
  });

  it("does not care what order the months arrive in", () => {
    expect(seasonLabel([11, 3, 10, 4, 5])).toBe("Mar–May · Oct–Nov");
  });
});

describe("gradeLevel", () => {
  it("is one to four, and the middle when it is something else", () => {
    expect(gradeLevel("easy")).toBe(1);
    expect(gradeLevel("Moderate")).toBe(2);
    expect(gradeLevel("hard")).toBe(3);
    expect(gradeLevel("strenuous")).toBe(4);
    expect(gradeLevel("epic")).toBe(2);
    expect(gradeLevel(null)).toBe(2);
  });
});

describe("filtering and sorting", () => {
  const card = (over: Partial<Card>): Card => ({
    slug: "s",
    name: "A route",
    region: "Khumbu",
    typical_days: 10,
    max_altitude_m: 4000,
    difficulty: "moderate",
    guides: 0,
    lo: null,
    ...over,
  });
  const cards = [
    card({ name: "Everest Base Camp", region: "Khumbu", max_altitude_m: 5644, typical_days: 14, lo: 54300, difficulty: "hard", season_months: [3, 4, 10, 11] }),
    card({ name: "Mardi Himal", region: "Annapurna", max_altitude_m: 4500, typical_days: 5, lo: 26400, season_months: [3, 4, 5, 10] }),
    card({ name: "Rara Lake", region: "Karnali", max_altitude_m: 3200, typical_days: 10, lo: null, season_months: [5, 6, 9] }),
  ];

  it("keeps everything on the empty filter, and narrows on region or grade", () => {
    expect(cards.filter((c) => matches(c))).toHaveLength(3);
    expect(cards.filter((c) => matches(c, { region: "Khumbu" }))).toHaveLength(1);
    expect(cards.filter((c) => matches(c, { grade: "moderate" }))).toHaveLength(2);
    expect(cards.filter((c) => matches(c, { region: "Khumbu", grade: "moderate" }))).toHaveLength(0);
  });

  it("narrows on how long you have got", () => {
    expect(cards.filter((c) => matches(c, { length: "short" })).map((c) => c.name)).toEqual([
      "Mardi Himal",
    ]);
    expect(cards.filter((c) => matches(c, { length: "week" })).map((c) => c.name)).toEqual([
      "Rara Lake",
    ]);
    expect(cards.filter((c) => matches(c, { length: "fortnight" })).map((c) => c.name)).toEqual([
      "Everest Base Camp",
    ]);
  });

  it("narrows on the month somebody is coming", () => {
    // The monsoon answer: in June the only thing on this list is Rara, which
    // sits in the rain shadow. That is the whole point of the facet.
    expect(cards.filter((c) => matches(c, { month: "6" })).map((c) => c.name)).toEqual([
      "Rara Lake",
    ]);
    expect(cards.filter((c) => matches(c, { month: "10" }))).toHaveLength(2);
  });

  it("returns nothing for a value nobody offers, rather than everything", () => {
    // A hand-edited URL that means nothing should not read as "no filter".
    expect(cards.filter((c) => matches(c, { month: "1" }))).toHaveLength(0);
    expect(cards.filter((c) => matches(c, { length: "weekend" }))).toHaveLength(0);
    expect(cards.filter((c) => matches(c, { grade: "brutal" }))).toHaveLength(0);
  });

  it("sorts by altitude, days and name", () => {
    expect(sortCards(cards, "altitude").map((c) => c.max_altitude_m)).toEqual([5644, 4500, 3200]);
    expect(sortCards(cards, "days").map((c) => c.typical_days)).toEqual([14, 10, 5]);
    expect(sortCards(cards, "name").map((c) => c.name[0])).toEqual(["E", "M", "R"]);
  });

  it("sends the routes with no price to the end of the cheapest list", () => {
    expect(sortCards(cards, "price").map((c) => c.lo)).toEqual([26400, 54300, null]);
  });

  it("does not mutate what it was given", () => {
    const before = cards.map((c) => c.name);
    sortCards(cards, "altitude");
    expect(cards.map((c) => c.name)).toEqual(before);
  });
});

describe("lengthOf", () => {
  it("puts a trek in the shape of holiday it fits", () => {
    expect(lengthOf(4)).toBe("short");
    expect(lengthOf(6)).toBe("short");
    expect(lengthOf(7)).toBe("week");
    expect(lengthOf(14)).toBe("fortnight");
    expect(lengthOf(21)).toBe("long");
  });

  it("has no opinion about a route with no length recorded", () => {
    expect(lengthOf(null)).toBeNull();
    expect(lengthOf(0)).toBeNull();
  });
});

describe("the facets are built from the data, not from a calendar", () => {
  const c = (over: Partial<Card>): Card => ({
    slug: "s", name: "A route", region: "Khumbu", typical_days: 10,
    max_altitude_m: 4000, difficulty: "moderate", guides: 0, lo: null, ...over,
  });

  it("offers only the months something is actually walked in", () => {
    // Nothing we run is in season in January. Offering it would be a filter
    // that always returns an empty page — the same lie as a shelf with one
    // card on it.
    const months = monthsOf([
      c({ season_months: [3, 4, 10] }),
      c({ season_months: [4, 10, 11] }),
    ]);
    expect(months.map((m) => m.month)).toEqual([3, 4, 10, 11]);
    expect(months.find((m) => m.month === 4)!.count).toBe(2);
    expect(months.find((m) => m.month === 3)!.label).toBe("March");
  });

  it("drops a length bucket nothing falls into", () => {
    const lengths = lengthsOf([c({ typical_days: 5 }), c({ typical_days: 6 })]);
    expect(lengths.map((l) => l.value)).toEqual(["short"]);
    expect(lengths[0].count).toBe(2);
  });
});

describe("resultHeading", () => {
  it("says the same number the filter bar says", () => {
    expect(resultHeading(24, 24)).toBe("All 24 routes");
    expect(resultHeading(8, 24)).toBe("8 routes match");
    expect(resultHeading(1, 24)).toBe("1 route matches");
    expect(resultHeading(0, 24)).toBe("No routes match");
  });
});

describe("regionsOf", () => {
  it("counts routes per region, biggest first", () => {
    const c = (region: string): Card => ({
      slug: region, name: region, region, typical_days: 1,
      max_altitude_m: 1, difficulty: "easy", guides: 0, lo: null,
    });
    expect(regionsOf([c("Khumbu"), c("Annapurna"), c("Khumbu")])).toEqual([
      { region: "Khumbu", count: 2 },
      { region: "Annapurna", count: 1 },
    ]);
  });
});

describe("routes on shelves, one per region", () => {
  const card = (region: string, name: string) => ({ region, name }) as any;

  it("puts every route under its own region", () => {
    const groups = groupByRegion([
      card("Khumbu", "Everest Base Camp"),
      card("Annapurna", "Mardi Himal"),
      card("Khumbu", "Gokyo Lakes"),
    ]);
    expect(groups.map((g) => g.region)).toEqual(["Khumbu", "Annapurna"]);
    expect(groups[0].routes).toHaveLength(2);
  });

  it("leads with the busiest region, then alphabetically", () => {
    // Where people actually go is a fair first shelf, and the tiebreak stops
    // the order wobbling between renders.
    const groups = groupByRegion([
      card("Manaslu", "a"),
      card("Annapurna", "b"),
      card("Annapurna", "c"),
      card("Dolpa", "d"),
    ]);
    expect(groups.map((g) => g.region)).toEqual(["Annapurna", "Dolpa", "Manaslu"]);
  });

  it("keeps the Nepali name and adds the English a stranger searches for", () => {
    // The name on the permit, on the bus and in the guide's mouth stays the
    // heading — but a trekker in Berlin types "Everest", not "Khumbu".
    const [khumbu] = groupByRegion([card("Khumbu", "Everest Base Camp")]);
    expect(khumbu.region).toBe("Khumbu");
    expect(khumbu.note).toBe("the Everest region");
  });

  it("does not explain a region that explains itself", () => {
    expect(groupByRegion([card("Annapurna", "x")])[0].note).toBeNull();
  });

  it("gives a route with no region somewhere to stand", () => {
    const groups = groupByRegion([card("", "orphan"), card("  ", "another")]);
    expect(groups[0].region).toBe("Elsewhere in Nepal");
    expect(groups[0].routes).toHaveLength(2);
  });

  it("has nothing to shelve when there is nothing", () => {
    expect(groupByRegion([])).toEqual([]);
  });
});
