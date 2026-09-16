import { describe, expect, it } from "vitest";
import { TREK_REGIONS, countRoutes, inRegion, regionBySlug, regionFor } from "./trek-regions";

describe("the regions", () => {
  it("has a unique slug and name for each", () => {
    const slugs = TREK_REGIONS.map((r) => r.slug);
    const names = TREK_REGIONS.map((r) => r.name);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses URL-safe slugs a person could read aloud", () => {
    for (const r of TREK_REGIONS) {
      expect(r.slug, r.slug).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("claims no database value twice", () => {
    // Two regions owning "Khumbu" would put the same route on two pages and
    // split its own search traffic.
    const seen = new Set<string>();
    for (const r of TREK_REGIONS) {
      for (const v of r.values) {
        const k = v.toLowerCase();
        expect(seen.has(k), `${v} claimed twice`).toBe(false);
        seen.add(k);
      }
    }
  });

  it("groups the ones the database splits but a trekker does not", () => {
    const everest = regionBySlug("everest")!;
    expect(everest.values).toContain("Khumbu");
    expect(everest.values).toContain("Solukhumbu");
    const west = regionBySlug("far-west")!;
    expect(west.values).toContain("Karnali");
    expect(west.values).toContain("Sudurpashchim");
  });

  it("says what somebody searching for it actually wants", () => {
    for (const r of TREK_REGIONS) {
      expect(r.blurb.length, r.slug).toBeGreaterThan(80);
      expect(r.intent.length, r.slug).toBeGreaterThan(10);
    }
  });
});

describe("matching a route's region", () => {
  it("is case and space insensitive", () => {
    const everest = regionBySlug("everest")!;
    expect(inRegion(everest, " khumbu ")).toBe(true);
    expect(inRegion(everest, "SOLUKHUMBU")).toBe(true);
    expect(inRegion(everest, "Annapurna")).toBe(false);
  });

  it("copes with a route that has no region", () => {
    expect(inRegion(regionBySlug("everest")!, null)).toBe(false);
    expect(regionFor(null)).toBeNull();
    expect(regionFor("Nowhere")).toBeNull();
  });

  it("finds the region a value belongs to", () => {
    expect(regionFor("Solukhumbu")?.slug).toBe("everest");
    expect(regionFor("Sudurpashchim")?.slug).toBe("far-west");
  });
});

describe("countRoutes", () => {
  // The 24 real routes, by their real region values.
  const rows = [
    ...Array(4).fill({ region: "Khumbu" }),
    { region: "Solukhumbu" },
    ...Array(6).fill({ region: "Annapurna" }),
    ...Array(3).fill({ region: "Langtang" }),
    ...Array(2).fill({ region: "Manaslu" }),
    { region: "Mustang" },
    { region: "Kanchenjunga" },
    { region: "Makalu" },
    { region: "Dhaulagiri" },
    { region: "Dolpa" },
    { region: "Karnali" },
    ...Array(2).fill({ region: "Sudurpashchim" }),
    { region: null },
  ];

  it("counts a grouped region across both its values", () => {
    expect(countRoutes(rows).get("everest")).toBe(5);
    expect(countRoutes(rows).get("far-west")).toBe(3);
  });

  it("returns a count for every region, including nought", () => {
    const counts = countRoutes([{ region: "Annapurna" }]);
    expect(counts.size).toBe(TREK_REGIONS.length);
    expect(counts.get("annapurna")).toBe(1);
    // Empty regions are reported rather than hidden, so the caller decides.
    expect(counts.get("dolpo")).toBe(0);
  });

  it("ignores a route with no region rather than miscounting it", () => {
    const total = [...countRoutes(rows).values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(rows.length - 1);
  });
});
