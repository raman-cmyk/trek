import { describe, expect, it } from "vitest";
import {
  gradeLevel,
  isRange,
  matches,
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
    // A guide fee of $400 split across a party of two is $200 each — not the
    // $9,999.99 sitting in the flat column from before the breakdown existed.
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
    card({ name: "Everest Base Camp", region: "Khumbu", max_altitude_m: 5644, typical_days: 14, lo: 54300, difficulty: "hard" }),
    card({ name: "Mardi Himal", region: "Annapurna", max_altitude_m: 4500, typical_days: 5, lo: 26400 }),
    card({ name: "Rara Lake", region: "Karnali", max_altitude_m: 3200, typical_days: 10, lo: null }),
  ];

  it("keeps everything on 'all', and narrows on region or grade", () => {
    expect(cards.filter((c) => matches(c, "all", "all"))).toHaveLength(3);
    expect(cards.filter((c) => matches(c, "Khumbu", "all"))).toHaveLength(1);
    expect(cards.filter((c) => matches(c, "all", "moderate"))).toHaveLength(2);
    expect(cards.filter((c) => matches(c, "Khumbu", "moderate"))).toHaveLength(0);
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
