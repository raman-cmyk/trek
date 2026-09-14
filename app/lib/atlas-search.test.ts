import { describe, expect, it } from "vitest";
import {
  buildGazetteer,
  fold,
  scorePlace,
  searchPlaces,
  type AtlasPlace,
  type GazetteerInput,
} from "./atlas-search";

const input: GazetteerInput = {
  trails: [
    {
      slug: "annapurna-circuit",
      name: "Annapurna Circuit",
      region: "Annapurna",
      days: 16,
      coords: [
        [84.1, 28.3],
        [83.9, 28.7],
        [83.7, 28.8],
      ],
      places: [
        { day: 3, name: "Chame", lng: 84.23, lat: 28.55 },
        { day: 7, name: "Manang", lng: 84.02, lat: 28.66 },
      ],
    },
    {
      slug: "nar-phu",
      name: "Nar Phu Valley",
      region: "Annapurna",
      days: 12,
      coords: [
        [84.2, 28.5],
        [84.3, 28.7],
      ],
      places: [{ day: 2, name: "Chame", lng: 84.23, lat: 28.55 }],
    },
    {
      slug: "everest-base-camp",
      name: "Everest Base Camp",
      region: "Khumbu",
      days: 14,
      coords: [
        [86.7, 27.7],
        [86.85, 27.99],
      ],
      places: [{ day: 1, name: "Lukla", lng: 86.73, lat: 27.69 }],
    },
  ],
  districts: [
    { name: "Solukhumbu", lng: 86.7, lat: 27.7, guides: 9 },
    { name: "Manang", lng: 84.02, lat: 28.66, guides: 2 },
  ],
};

const gaz = buildGazetteer(input);
const find = (id: string) => gaz.find((p) => p.id === id)!;

describe("fold", () => {
  it("ignores case, accents and punctuation", () => {
    expect(fold("Gho-repani")).toBe("gho repani");
    expect(fold("Pokharā")).toBe("pokhara");
  });

  it("is empty for a query of pure punctuation", () => {
    expect(fold("  -- ")).toBe("");
  });
});

describe("buildGazetteer", () => {
  it("offers every trail, its villages, its region and our districts", () => {
    expect(gaz.filter((p) => p.kind === "trail")).toHaveLength(3);
    expect(gaz.filter((p) => p.kind === "region").map((p) => p.name).sort()).toEqual([
      "Annapurna",
      "Khumbu",
    ]);
    expect(find("village:lukla").name).toBe("Lukla");
  });

  it("lists a village once however many treks pass through it", () => {
    const chame = gaz.filter((p) => p.name === "Chame");
    expect(chame).toHaveLength(1);
    expect(chame[0].sub).toBe("On Annapurna Circuit and Nar Phu Valley");
  });

  it("does not repeat a district that is already a village on a trail", () => {
    // Manang is a stop on the Circuit AND a district. One row, the useful one.
    expect(gaz.filter((p) => fold(p.name) === "manang")).toHaveLength(1);
    expect(find("village:manang").kind).toBe("village");
  });

  it("skips a trail with no line to place it on", () => {
    const g = buildGazetteer({ trails: [{ ...input.trails[0], coords: [] }], districts: [] });
    expect(g).toEqual([]);
  });

  it("counts guides in a district subtitle, singular included", () => {
    expect(find("district:solukhumbu").sub).toBe("Home to 9 guides");
    const one = buildGazetteer({
      trails: [],
      districts: [{ name: "Mustang", lng: 83.8, lat: 28.9, guides: 1 }],
    });
    expect(one[0].sub).toBe("Home to 1 guide");
  });

  it("carries the trail a village belongs to, so choosing it selects the trek", () => {
    expect(find("village:lukla").trailSlug).toBe("everest-base-camp");
  });
});

describe("scorePlace", () => {
  const place = (over: Partial<AtlasPlace>): AtlasPlace => ({
    id: "x",
    name: "Manang",
    kind: "village",
    sub: "On Annapurna Circuit",
    lng: 0,
    lat: 0,
    zoom: 12,
    ...over,
  });

  it("does not match an empty query", () => {
    expect(scorePlace(place({}), "   ")).toBeNull();
  });

  it("does not match something unrelated", () => {
    expect(scorePlace(place({}), "zanzibar")).toBeNull();
  });

  it("prefers the start of a name to the middle of another", () => {
    const manang = scorePlace(place({ name: "Manang" }), "man")!;
    const katmandu = scorePlace(place({ name: "Kathmandu" }), "man")!;
    expect(manang).toBeLessThan(katmandu);
  });

  it("matches a word inside a name", () => {
    expect(scorePlace(place({ name: "Annapurna Base Camp" }), "base")).not.toBeNull();
  });

  it("falls back to the subtitle, but ranks it last", () => {
    const bySub = scorePlace(place({ name: "Chame", sub: "On Annapurna Circuit" }), "annapurna")!;
    const byName = scorePlace(place({ name: "Annapurna Circuit", sub: "" }), "annapurna")!;
    expect(byName).toBeLessThan(bySub);
  });
});

describe("searchPlaces", () => {
  it("finds a village by prefix", () => {
    expect(searchPlaces(gaz, "cha")[0].name).toBe("Chame");
  });

  it("puts the trail above the villages that merely mention it", () => {
    expect(searchPlaces(gaz, "everest")[0].name).toBe("Everest Base Camp");
  });

  it("returns nothing rather than everything for a query that matches nothing", () => {
    expect(searchPlaces(gaz, "qqqq")).toEqual([]);
  });

  it("returns nothing for an empty query rather than the whole country", () => {
    expect(searchPlaces(gaz, "")).toEqual([]);
  });

  it("honours the limit", () => {
    expect(searchPlaces(gaz, "a", 2)).toHaveLength(2);
  });

  it("survives a query of pure punctuation", () => {
    expect(searchPlaces(gaz, "!!!")).toEqual([]);
  });
});
