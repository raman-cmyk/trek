import { describe, expect, it } from "vitest";
import {
  DISTRICT_COUNT,
  DISTRICTS,
  districtsByProvince,
  isDistrict,
  PROVINCES,
  searchDistricts,
} from "./districts";

describe("the districts", () => {
  it("has all seventy-seven", () => {
    expect(DISTRICTS).toHaveLength(DISTRICT_COUNT);
  });

  it("names each one once", () => {
    const names = DISTRICTS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("covers the seven provinces, and every district sits in one", () => {
    expect(PROVINCES).toHaveLength(7);
    const grouped = districtsByProvince();
    expect(grouped.reduce((n, g) => n + g.districts.length, 0)).toBe(DISTRICT_COUNT);
    for (const d of DISTRICTS) expect(PROVINCES).toContain(d.province as any);
  });

  it("includes the districts the trekking roster actually comes from", () => {
    for (const n of ["Solukhumbu", "Kaski", "Manang", "Mustang", "Rasuwa", "Gorkha", "Taplejung", "Dolpa"]) {
      expect(isDistrict(n), n).toBe(true);
    }
  });

  it("does not include a province as a district", () => {
    for (const p of PROVINCES) expect(isDistrict(p)).toBe(false);
  });
});

describe("searchDistricts", () => {
  it("matches the middle of a name, not only the start", () => {
    // Somebody looking for Sankhuwasabha types "sabha".
    expect(searchDistricts("sabha").map((d) => d.name)).toContain("Sankhuwasabha");
  });

  it("puts a prefix match first", () => {
    expect(searchDistricts("kath")[0].name).toBe("Kathmandu");
  });

  it("ignores case and spaces", () => {
    expect(searchDistricts("  SOLU khumbu ")[0].name).toBe("Solukhumbu");
  });

  it("finds a district by its province", () => {
    expect(searchDistricts("gandaki").length).toBeGreaterThan(0);
  });

  it("shows something rather than nothing before anyone types", () => {
    expect(searchDistricts("").length).toBeGreaterThan(0);
  });

  it("finds the two-word districts", () => {
    expect(searchDistricts("rukum").map((d) => d.name).sort()).toEqual([
      "Eastern Rukum",
      "Western Rukum",
    ]);
  });
});
