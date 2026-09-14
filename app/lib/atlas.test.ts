import { describe, expect, it } from "vitest";
import {
  fanOut,
  guidesForTrail,
  linkLabel,
  rankTrails,
  tourStops,
  trailBounds,
  trailCentre,
  trailFacts,
  trailGuideLabel,
  trailsForGuide,
  type AtlasGuide,
  type AtlasTrail,
} from "./atlas";

const guide = (over: Partial<AtlasGuide> & { id: string }): AtlasGuide => ({
  slug: over.id,
  name: over.id,
  avatar: null,
  tier: 1,
  hook: null,
  district: "Solukhumbu",
  regions: [],
  lng: 86.7,
  lat: 27.8,
  ...over,
});

const trail = (over: Partial<AtlasTrail> & { slug: string }): AtlasTrail => ({
  name: over.slug,
  region: "Khumbu",
  days: 14,
  maxAltitudeM: 5364,
  coords: [
    [86.7, 27.7],
    [86.8, 27.9],
  ],
  ...over,
});

const EBC = trail({ slug: "everest-base-camp", name: "Everest Base Camp", region: "Khumbu" });
const ABC = trail({
  slug: "annapurna-base-camp",
  name: "Annapurna Base Camp",
  region: "Annapurna",
  coords: [
    [83.9, 28.3],
    [83.88, 28.53],
  ],
});

describe("guidesForTrail", () => {
  const pemba = guide({ id: "pemba", regions: ["Khumbu"], tier: 3 });
  const dawa = guide({ id: "dawa", regions: ["Khumbu"], tier: 1 });
  const sunita = guide({ id: "sunita", regions: ["Annapurna"], tier: 2 });
  const guides = [pemba, dawa, sunita];
  const offerings = [{ guideId: "dawa", routeSlug: "everest-base-camp" }];

  it("puts somebody you can book on this trek before somebody who merely works there", () => {
    const out = guidesForTrail(EBC, guides, offerings);
    expect(out[0].guide.id).toBe("dawa");
    expect(out[0].kind).toBe("sells");
  });

  it("keeps the difference between the two kinds rather than flattening it", () => {
    const out = guidesForTrail(EBC, guides, offerings);
    expect(out.find((x) => x.guide.id === "pemba")!.kind).toBe("region");
  });

  it("does not put an Annapurna guide on an Everest trail", () => {
    const ids = guidesForTrail(EBC, guides, offerings).map((x) => x.guide.id);
    expect(ids).not.toContain("sunita");
  });

  it("orders the regional guides by how far we have checked them", () => {
    const out = guidesForTrail(EBC, guides, []).map((x) => x.guide.id);
    expect(out).toEqual(["pemba", "dawa"]);
  });

  it("never lists the same person twice when they both sell it and work there", () => {
    const out = guidesForTrail(EBC, guides, [
      { guideId: "pemba", routeSlug: "everest-base-camp" },
    ]);
    expect(out.filter((x) => x.guide.id === "pemba")).toHaveLength(1);
  });

  it("matches a region whatever its casing or spacing", () => {
    const messy = guide({ id: "messy", regions: [" khumbu "] });
    expect(guidesForTrail(EBC, [messy], [])).toHaveLength(1);
  });

  it("is empty for a trail nobody covers, rather than filling it with anybody", () => {
    expect(guidesForTrail(ABC, [pemba, dawa], [])).toEqual([]);
  });

  it("respects the cap", () => {
    const many = Array.from({ length: 30 }, (_, i) => guide({ id: `g${i}`, regions: ["Khumbu"] }));
    expect(guidesForTrail(EBC, many, [], 6)).toHaveLength(6);
  });
});

describe("trailsForGuide", () => {
  it("lights up what they sell and where they work", () => {
    const g = guide({ id: "pemba", regions: ["Annapurna"] });
    const out = trailsForGuide(g, [EBC, ABC], [{ guideId: "pemba", routeSlug: "everest-base-camp" }]);
    expect(out.sort()).toEqual(["annapurna-base-camp", "everest-base-camp"]);
  });

  it("is empty for a guide with no listings and no regions", () => {
    expect(trailsForGuide(guide({ id: "new" }), [EBC, ABC], [])).toEqual([]);
  });
});

describe("rankTrails", () => {
  const guides = [
    guide({ id: "a", regions: ["Khumbu"] }),
    guide({ id: "b", regions: ["Khumbu"] }),
    guide({ id: "c", regions: ["Annapurna"] }),
  ];

  it("puts the trails you can actually walk with somebody first", () => {
    const out = rankTrails([ABC, EBC], guides, []);
    expect(out[0].trail.slug).toBe("everest-base-camp");
    expect(out[0].guideCount).toBe(2);
  });

  it("ranks a trail people sell above a busier region nobody sells", () => {
    // The real data: Annapurna Base Camp had eighteen guides whose regions
    // covered it and not one selling it, and it outranked Everest Base Camp,
    // which seven guides sell. The rail led with what you cannot book.
    const crowd = Array.from({ length: 18 }, (_, i) =>
      guide({ id: `r${i}`, regions: ["Annapurna"] }),
    );
    const seller = guide({ id: "s1", regions: [] });
    const out = rankTrails(
      [ABC, EBC],
      [...crowd, seller],
      [{ guideId: "s1", routeSlug: "everest-base-camp" }],
    );
    expect(out[0].trail.slug).toBe("everest-base-camp");
    expect(out[0].sellCount).toBe(1);
    expect(out[1].sellCount).toBe(0);
    expect(out[1].guideCount).toBe(18);
  });

  it("counts every regional guide even though the map only shows a few", () => {
    const crowd = Array.from({ length: 18 }, (_, i) =>
      guide({ id: `r${i}`, regions: ["Khumbu"] }),
    );
    expect(rankTrails([EBC], crowd, [])[0].guideCount).toBe(18);
  });

  it("drops a trail with no line to draw", () => {
    const noGeom = trail({ slug: "ghost", coords: [] });
    expect(rankTrails([noGeom, EBC], guides, []).map((r) => r.trail.slug)).toEqual([
      "everest-base-camp",
    ]);
  });
});

describe("tourStops", () => {
  it("spreads across regions rather than showing three Everest trails in a row", () => {
    const khumbu2 = trail({ slug: "gokyo", name: "Gokyo", region: "Khumbu" });
    const guides = [
      guide({ id: "a", regions: ["Khumbu"] }),
      guide({ id: "b", regions: ["Annapurna"] }),
    ];
    const ranked = rankTrails([EBC, khumbu2, ABC], guides, []);
    const stops = tourStops(ranked, 2).map((t) => t.region);
    expect(new Set(stops).size).toBe(2);
  });

  it("visits a trail somebody sells before a busier one nobody sells", () => {
    const crowd = Array.from({ length: 9 }, (_, i) =>
      guide({ id: `r${i}`, regions: ["Annapurna"] }),
    );
    const seller = guide({ id: "s1", regions: [] });
    const ranked = rankTrails(
      [ABC, EBC],
      [...crowd, seller],
      [{ guideId: "s1", routeSlug: "everest-base-camp" }],
    );
    expect(tourStops(ranked, 1).map((t) => t.slug)).toEqual(["everest-base-camp"]);
  });

  it("never sends the tour to a trail with nobody on it", () => {
    const empty = trail({ slug: "empty", region: "Dolpo" });
    const ranked = rankTrails([empty], [], []);
    expect(tourStops(ranked)).toEqual([]);
  });

  it("tops up from the ranking rather than showing a two-stop tour", () => {
    const k2 = trail({ slug: "gokyo", name: "Gokyo", region: "Khumbu" });
    const guides = [guide({ id: "a", regions: ["Khumbu"] })];
    const ranked = rankTrails([EBC, k2], guides, []);
    expect(tourStops(ranked, 2)).toHaveLength(2);
  });
});

describe("geometry helpers", () => {
  it("finds the middle of a trail", () => {
    const [lng, lat] = trailCentre(EBC);
    expect(lng).toBeCloseTo(86.75, 2);
    expect(lat).toBeCloseTo(27.8, 2);
  });

  it("pads the bounds so the trail is not flush to the edge", () => {
    const b = trailBounds(EBC, 0.1)!;
    expect(b[0][0]).toBeCloseTo(86.6, 5);
    expect(b[1][1]).toBeCloseTo(28.0, 5);
  });

  it("has no bounds for a trail with no line", () => {
    expect(trailBounds(trail({ slug: "x", coords: [] }))).toBeNull();
  });
});

describe("wording", () => {
  it("states the two facts that decide whether a trail is for you", () => {
    expect(trailFacts(EBC)).toBe("14 days · 5,364 m");
  });

  it("says nothing rather than empty separators when the facts are missing", () => {
    expect(trailFacts(trail({ slug: "x", days: null, maxAltitudeM: null }))).toBe("");
  });

  it("does not claim you can book somebody you cannot", () => {
    expect(linkLabel("sells")).toBe("Runs this trek");
    expect(linkLabel("region")).toBe("Works this region");
  });
});

describe("fanOut", () => {
  const at = (id: string, lng = 86.7, lat = 27.8) => ({ id, lng, lat });

  it("leaves a lone guide exactly where they are", () => {
    expect(fanOut([at("a")])).toEqual([at("a")]);
  });

  it("separates guides who share a district centre", () => {
    const out = fanOut([at("a"), at("b"), at("c")]);
    const spots = new Set(out.map((p) => `${p.lng.toFixed(4)},${p.lat.toFixed(4)}`));
    expect(spots.size).toBe(3);
  });

  it("keeps everyone close enough to still be in their own district", () => {
    for (const p of fanOut([at("a"), at("b")])) {
      expect(Math.abs(p.lat - 27.8)).toBeLessThan(0.1);
      expect(Math.abs(p.lng - 86.7)).toBeLessThan(0.16);
    }
  });

  it("is deterministic, so a face does not hop between page loads", () => {
    const a = fanOut([at("x"), at("y"), at("z")]);
    const b = fanOut([at("z"), at("y"), at("x")]);
    expect(a.map((p) => [p.id, p.lng.toFixed(6)])).toEqual(
      b.map((p) => [p.id, p.lng.toFixed(6)]),
    );
  });

  it("does not move guides who are genuinely in different places", () => {
    const out = fanOut([at("a"), at("b", 83.9, 28.3)]);
    expect(out).toHaveLength(2);
    expect(out.find((p) => p.id === "b")!.lng).toBe(83.9);
  });
});

describe("the weak link is capped and named", () => {
  const crowd = Array.from({ length: 18 }, (_, i) =>
    guide({ id: `r${i}`, regions: ["Annapurna"], tier: 1 }),
  );

  it("does not let region guides fill the whole map", () => {
    const out = guidesForTrail(ABC, crowd, []);
    expect(out).toHaveLength(6);
    expect(out.every((g) => g.kind === "region")).toBe(true);
  });

  it("still shows every seller, and tops up around them", () => {
    const sellers = Array.from({ length: 3 }, (_, i) => guide({ id: `s${i}`, regions: [] }));
    const out = guidesForTrail(
      ABC,
      [...sellers, ...crowd],
      sellers.map((g) => ({ guideId: g.id, routeSlug: "annapurna-base-camp" })),
    );
    expect(out.filter((g) => g.kind === "sells")).toHaveLength(3);
    expect(out.filter((g) => g.kind === "region")).toHaveLength(6);
  });

  it("says who can be booked, not how many share a postcode", () => {
    expect(trailGuideLabel({ trail: EBC, sellCount: 7, guideCount: 20 })).toBe("7 guides");
    expect(trailGuideLabel({ trail: EBC, sellCount: 1, guideCount: 9 })).toBe("1 guide");
    expect(trailGuideLabel({ trail: ABC, sellCount: 0, guideCount: 18 })).toBe(
      "18 in the region",
    );
    expect(trailGuideLabel({ trail: ABC, sellCount: 0, guideCount: 0 })).toBe("No guides yet");
  });
});
