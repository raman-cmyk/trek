import { describe, it, expect } from "vitest";
import {
  REGIONS,
  countByRegion,
  inRegion,
  regionByKey,
  regionForRouteValue,
} from "./regions";

describe("the regions of Nepal", () => {
  it("has the twelve the office names", () => {
    expect(REGIONS).toHaveLength(12);
    expect(REGIONS.map((r) => r.label)).toContain("Mustang");
    expect(REGIONS.map((r) => r.label)).toContain("Kanchenjunga");
    expect(REGIONS.map((r) => r.label)).toContain("Rolwaling");
  });

  it("gives every one a label and a reason to pick it", () => {
    for (const r of REGIONS) {
      expect(r.label.length).toBeGreaterThan(3);
      expect(r.blurb.length).toBeGreaterThan(15);
      expect(r.matches.length).toBeGreaterThan(0);
    }
  });

  it("maps no database value to two regions", () => {
    const seen = new Set<string>();
    for (const r of REGIONS) {
      for (const m of r.matches) {
        expect(seen.has(m)).toBe(false);
        seen.add(m);
      }
    }
  });
});

describe("a region is not one column value", () => {
  it("puts Khumbu and Solukhumbu under Everest", () => {
    expect(regionForRouteValue("Khumbu")?.key).toBe("everest");
    expect(regionForRouteValue("Solukhumbu")?.key).toBe("everest");
  });

  it("puts Karnali and Sudurpashchim under the west", () => {
    expect(regionForRouteValue("Karnali")?.key).toBe("west");
    expect(regionForRouteValue("Sudurpashchim")?.key).toBe("west");
  });

  it("reads Dolpa as Dolpo, which is how it is spelled in the data", () => {
    expect(regionForRouteValue("Dolpa")?.label).toBe("Dolpo");
  });

  it("drops a value nobody has grouped rather than guessing", () => {
    expect(regionForRouteValue("Atlantis")).toBeNull();
    expect(regionForRouteValue(null)).toBeNull();
  });
});

describe("filtering by region", () => {
  it("lets everything through when nothing is chosen", () => {
    expect(inRegion("Mustang", null)).toBe(true);
    expect(inRegion(null, null)).toBe(true);
  });

  it("keeps both of a region's values", () => {
    expect(inRegion("Solukhumbu", "everest")).toBe(true);
    expect(inRegion("Khumbu", "everest")).toBe(true);
    expect(inRegion("Annapurna", "everest")).toBe(false);
  });

  it("excludes a trip with no route when a region is chosen", () => {
    expect(inRegion(null, "everest")).toBe(false);
  });

  it("ignores a region key it does not know", () => {
    expect(inRegion("Mustang", "moon")).toBe(true);
  });
});

describe("counting what is actually there", () => {
  it("counts a region across all of its values", () => {
    const counts = countByRegion([
      { region: "Khumbu" },
      { region: "Solukhumbu" },
      { region: "Annapurna" },
      { region: null },
      { region: "Atlantis" },
    ]);
    expect(counts.everest).toBe(2);
    expect(counts.annapurna).toBe(1);
  });

  it("gives an empty region a zero rather than leaving it out", () => {
    const counts = countByRegion([{ region: "Khumbu" }]);
    expect(counts.rolwaling).toBe(0);
    expect(Object.keys(counts)).toHaveLength(12);
  });
});

describe("keys", () => {
  it("round-trips", () => {
    expect(regionByKey("mustang")?.label).toBe("Mustang");
    expect(regionByKey("nope")).toBeNull();
    expect(regionByKey(null)).toBeNull();
  });
});
