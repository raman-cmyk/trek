import { describe, it, expect } from "vitest";
import {
  DAY_BANDS,
  EMPTY_FILTERS,
  filterRoutes,
  isNarrowed,
  matchesMonth,
  parseRouteFilters,
  routeFacets,
  routeMatchesText,
  type SearchableRoute,
} from "./route-search";

const EBC: SearchableRoute = {
  name: "Everest Base Camp",
  region: "Khumbu",
  difficulty: "challenging",
  typical_days: 14,
  max_altitude_m: 5545,
  season_months: [3, 4, 5, 10, 11],
  teaser: "Walk to the foot of the highest mountain on earth.",
};
const GHANDRUK: SearchableRoute = {
  name: "Ghandruk village walk",
  region: "Annapurna",
  difficulty: "easy",
  typical_days: 3,
  max_altitude_m: 2100,
  season_months: [2, 3, 4, 10, 11, 12],
  teaser: "Stone Gurung villages and terraced fields.",
};
const CIRCUIT: SearchableRoute = {
  name: "Annapurna Circuit",
  region: "Annapurna",
  difficulty: "challenging",
  typical_days: 16,
  max_altitude_m: 5416,
  season_months: [3, 4, 10, 11],
  teaser: "The full circuit over Thorong La.",
};
const LANGTANG: SearchableRoute = {
  name: "Langtang Valley",
  region: "Langtang",
  difficulty: "moderate",
  typical_days: 8,
  max_altitude_m: 4773,
  season_months: null,
  teaser: null,
};
const ALL = [EBC, GHANDRUK, CIRCUIT, LANGTANG];

const f = (over: Partial<typeof EMPTY_FILTERS>) => ({ ...EMPTY_FILTERS, ...over });

describe("typing words in the box", () => {
  it("finds a route by its name", () => {
    expect(routeMatchesText(EBC, "everest")).toBe(true);
    expect(routeMatchesText(GHANDRUK, "everest")).toBe(false);
  });
  it("finds it by region or difficulty", () => {
    expect(routeMatchesText(GHANDRUK, "annapurna")).toBe(true);
    expect(routeMatchesText(GHANDRUK, "easy")).toBe(true);
  });
  it("finds it in the teaser", () => {
    expect(routeMatchesText(CIRCUIT, "thorong")).toBe(true);
  });
  it("needs every word, so two words narrow rather than widen", () => {
    expect(routeMatchesText(CIRCUIT, "annapurna circuit")).toBe(true);
    expect(routeMatchesText(GHANDRUK, "annapurna circuit")).toBe(false);
    expect(routeMatchesText(GHANDRUK, "easy annapurna")).toBe(true);
    expect(routeMatchesText(CIRCUIT, "easy annapurna")).toBe(false);
  });
  it("ignores case and stray spaces", () => {
    expect(routeMatchesText(EBC, "  EVEREST   base  ")).toBe(true);
  });
  it("matches the numbers people type", () => {
    expect(routeMatchesText(LANGTANG, "8 days")).toBe(true);
    expect(routeMatchesText(EBC, "5545m")).toBe(true);
  });
  it("an empty query matches everything", () => {
    expect(routeMatchesText(EBC, "")).toBe(true);
    expect(filterRoutes(ALL, EMPTY_FILTERS)).toHaveLength(4);
  });
});

describe("the route's own summary is searchable", () => {
  it("because it is the sentence printed on the card", () => {
    const r = {
      ...LANGTANG,
      teaser: null,
      summary: "Yak cheese, glaciers, and the valley Nima rebuilt after 2015.",
    };
    expect(routeMatchesText(r, "yak cheese")).toBe(true);
    expect(routeMatchesText(r, "rebuilt")).toBe(true);
    expect(routeMatchesText(r, "sherpa")).toBe(false);
  });
});

describe("the filters", () => {
  it("region and difficulty are exact", () => {
    expect(filterRoutes(ALL, f({ region: "Annapurna" })).map((r) => r.name)).toEqual([
      "Ghandruk village walk",
      "Annapurna Circuit",
    ]);
    expect(filterRoutes(ALL, f({ difficulty: "easy" })).map((r) => r.name)).toEqual([
      "Ghandruk village walk",
    ]);
  });

  it("the day bands cover every length with no gap", () => {
    for (const d of [1, 5, 6, 10, 11, 30]) {
      const hit = DAY_BANDS.filter((b) => d >= b.min && d <= b.max);
      expect(hit).toHaveLength(1);
    }
  });

  it("filters by how long you are away", () => {
    expect(filterRoutes(ALL, f({ days: "short" })).map((r) => r.name)).toEqual([
      "Ghandruk village walk",
    ]);
    expect(filterRoutes(ALL, f({ days: "week" })).map((r) => r.name)).toEqual(["Langtang Valley"]);
    expect(filterRoutes(ALL, f({ days: "long" })).map((r) => r.name)).toEqual([
      "Everest Base Camp",
      "Annapurna Circuit",
    ]);
  });

  it("filters by the month you can travel", () => {
    expect(filterRoutes(ALL, f({ month: "12" })).map((r) => r.name)).toEqual([
      "Ghandruk village walk",
      // No season recorded is not a claim that it is shut.
      "Langtang Valley",
    ]);
    expect(matchesMonth(EBC, "12")).toBe(false);
    expect(matchesMonth(EBC, "10")).toBe(true);
  });

  it("stack, so a search plus a month is both", () => {
    expect(filterRoutes(ALL, f({ q: "annapurna", month: "12" })).map((r) => r.name)).toEqual([
      "Ghandruk village walk",
    ]);
  });

  it("can leave nothing, which is a real answer", () => {
    expect(filterRoutes(ALL, f({ q: "kilimanjaro" }))).toHaveLength(0);
  });
});

describe("reading the query string", () => {
  it("keeps what is valid", () => {
    const p = new URLSearchParams("q=everest&region=Khumbu&difficulty=easy&days=week&month=10");
    expect(parseRouteFilters(p)).toEqual({
      q: "everest",
      region: "Khumbu",
      difficulty: "easy",
      days: "week",
      month: "10",
    });
  });
  it("drops a day band and a month it does not recognise", () => {
    const p = new URLSearchParams("days=fortnight&month=13");
    expect(parseRouteFilters(p)).toMatchObject({ days: "", month: "" });
    expect(parseRouteFilters(new URLSearchParams("month=0")).month).toBe("");
    expect(parseRouteFilters(new URLSearchParams("month=abc")).month).toBe("");
  });
  it("knows when anything is applied", () => {
    expect(isNarrowed(EMPTY_FILTERS)).toBe(false);
    expect(isNarrowed(f({ month: "10" }))).toBe(true);
    expect(isNarrowed(f({ q: "x" }))).toBe(true);
  });
});

describe("the dropdown lists", () => {
  it("are built from every route, easiest difficulty first", () => {
    const facets = routeFacets(ALL);
    expect(facets.regions).toEqual(["Annapurna", "Khumbu", "Langtang"]);
    expect(facets.difficulties).toEqual(["easy", "moderate", "challenging"]);
  });
  it("skip routes with nothing recorded", () => {
    const facets = routeFacets([{ ...LANGTANG, region: null, difficulty: null }]);
    expect(facets).toEqual({ regions: [], difficulties: [] });
  });
});
