import { describe, it, expect } from "vitest";
import { evaluatePolicy, altitudeThresholdM } from "./insurance";

const all = {
  altitude: true,
  helicopter: true,
  medical: true,
  repatriation: true,
  datesCovered: true,
};

describe("insurance qualification", () => {
  it("qualifies when altitude + helicopter are covered", () => {
    const v = evaluatePolicy(all);
    expect(v.qualifies).toBe(true);
    expect(v.missingRequired).toEqual([]);
  });

  it("fails without helicopter evacuation (the common gap)", () => {
    const v = evaluatePolicy({ ...all, helicopter: false });
    expect(v.qualifies).toBe(false);
    expect(v.missingRequired.join()).toMatch(/helicopter/i);
  });

  it("fails without high-altitude cover", () => {
    const v = evaluatePolicy({ ...all, altitude: false });
    expect(v.qualifies).toBe(false);
  });

  it("still qualifies when only recommended items are missing", () => {
    const v = evaluatePolicy({ ...all, medical: false, repatriation: false });
    expect(v.qualifies).toBe(true);
  });

  it("threshold uses the trek's altitude, or defaults to 4000m", () => {
    expect(altitudeThresholdM(5416)).toBe(5416);
    expect(altitudeThresholdM(null)).toBe(4000);
    expect(altitudeThresholdM(0)).toBe(4000);
  });

  it("labels the altitude requirement with the threshold", () => {
    const v = evaluatePolicy(all, { maxAltitudeM: 5416 });
    expect(v.requirements[0].label).toMatch(/5,416m/);
  });
});
