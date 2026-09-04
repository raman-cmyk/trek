import { describe, expect, it } from "vitest";
import { MAX_TIMES_WALKED, parseTimesWalked } from "./guide-routes";

describe("parseTimesWalked", () => {
  it("takes a plain count", () => {
    expect(parseTimesWalked(12)).toBe(12);
    expect(parseTimesWalked("12")).toBe(12);
    expect(parseTimesWalked(" 12 ")).toBe(12);
  });

  it("clamps to the column's CHECK rather than failing the insert", () => {
    expect(parseTimesWalked(99999)).toBe(MAX_TIMES_WALKED);
  });

  it("rounds a decimal — you cannot walk a route 2.5 times", () => {
    expect(parseTimesWalked("2.6")).toBe(3);
  });

  it("refuses zero, negatives and nonsense instead of defaulting", () => {
    for (const bad of [0, -4, "", "  ", "many", null, undefined, NaN, {}]) {
      expect(parseTimesWalked(bad)).toBeNull();
    }
  });
});
