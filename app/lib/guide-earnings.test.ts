import { describe, expect, it } from "vitest";
import { FX_RATE_NPR } from "./config";
import {
  earningsFor,
  formatNpr,
  nprFromUsdCents,
  rateRange,
  usdCentsFromNpr,
} from "./guide-earnings";

describe("the currency a guide thinks in", () => {
  it("converts a rate both ways without drifting", () => {
    for (const npr of [3500, 4500, 5000, 8000]) {
      expect(nprFromUsdCents(usdCentsFromNpr(npr))).toBeCloseTo(npr, -1);
    }
  });

  it("uses the platform's own rate, not a number typed here", () => {
    expect(nprFromUsdCents(10_000)).toBe(100 * FX_RATE_NPR);
  });
});

describe("rateRange", () => {
  // The 49 real rates on production sit between NPR 3,591 and 7,980 with the
  // middle half from about 4,100 to 5,200.
  const real = [27, 30, 31, 32, 33, 34, 34, 35, 36, 38, 39, 40, 45, 60].map((usd) => usd * 100);

  it("gives the middle half, not the full spread", () => {
    const r = rateRange(real)!;
    expect(r.low).toBeGreaterThan(nprFromUsdCents(2700));
    expect(r.high).toBeLessThan(nprFromUsdCents(6000));
    expect(r.low).toBeLessThan(r.high);
  });

  it("rounds to something that reads as a guide, not a quote", () => {
    const r = rateRange(real)!;
    expect(r.low % 100).toBe(0);
    expect(r.high % 100).toBe(0);
  });

  it("says how many guides it is based on", () => {
    expect(rateRange(real)!.from).toBe(real.length);
  });

  it("ignores missing and nonsense rates", () => {
    const r = rateRange([...real, null, undefined, 0, -500])!;
    expect(r.from).toBe(real.length);
  });

  it("returns nothing rather than a range from three people", () => {
    expect(rateRange([3000, 4000, 5000])).toBeNull();
    expect(rateRange([])).toBeNull();
  });
});

describe("earningsFor", () => {
  it("multiplies the rate by the days, with nothing taken off", () => {
    // Our fee rides on top of the package, so the whole of this is theirs.
    expect(earningsFor(5000, 14)).toEqual({ perDay: 5000, days: 14, total: 70_000 });
  });

  it("refuses to preview nothing", () => {
    expect(earningsFor(0, 14)).toBeNull();
    expect(earningsFor(5000, 0)).toBeNull();
    expect(earningsFor(NaN, 14)).toBeNull();
    expect(earningsFor(5000, NaN)).toBeNull();
  });
});

describe("formatNpr", () => {
  it("groups the thousands", () => {
    expect(formatNpr(70_000)).toBe("NPR 70,000");
    expect(formatNpr(4522.4)).toBe("NPR 4,522");
  });
});
