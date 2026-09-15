import { describe, it, expect } from "vitest";
import { AMS_FLOOR_M, dayDetail, routeHigh } from "./trek-day-detail";

const base = {
  day: 5,
  place: "Somewhere",
  up: 0,
  down: 0,
  rest: false,
  sleptAtM: null as number | null,
  routeHighM: null as number | null,
};

describe("what a day does to you", () => {
  it("warns on the first night altitude can be felt", () => {
    const d = dayDetail({ ...base, altitude_m: 2_710, sleptAtM: 1_860, up: 850 });
    expect(d[0].tone).toBe("watch");
    expect(d[0].text).toContain("first night above 2,500m");
  });

  it("names a sleeping gain over the guidance, with the rule", () => {
    const d = dayDetail({ ...base, altitude_m: 4_050, sleptAtM: 3_520, up: 530 });
    expect(d[0].text).toContain("530m higher than last night");
    expect(d[0].text).toContain("500m a night");
  });

  it("says nothing about gain below the altitude where it matters", () => {
    const d = dayDetail({ ...base, altitude_m: 1_300, sleptAtM: 840, up: 460 });
    expect(d).toEqual([]);
  });

  it("explains what a rest day is for, rather than calling it a day off", () => {
    const d = dayDetail({ ...base, altitude_m: 3_520, sleptAtM: 3_520, rest: true });
    expect(d[0].text).toContain("come back down to sleep");
  });

  it("marks the highest night on the route", () => {
    const d = dayDetail({ ...base, altitude_m: 4_450, sleptAtM: 4_050, routeHighM: 4_450 });
    expect(d[0].text).toContain("highest you sleep");
  });

  it("gives the descent its due after days up high", () => {
    const d = dayDetail({ ...base, altitude_m: 2_810, sleptAtM: 3_800, down: 990 });
    expect(d[0].tone).toBe("relief");
    expect(d[0].text).toContain("990m of descent");
  });

  it("never prints more than two, because five caveats is none", () => {
    const d = dayDetail({
      ...base,
      altitude_m: 5_000,
      sleptAtM: 4_000,
      up: 1_000,
      routeHighM: 5_000,
    });
    expect(d.length).toBeLessThanOrEqual(2);
  });

  it("says nothing on day one, when there is no night before it", () => {
    expect(dayDetail({ ...base, day: 1, altitude_m: 840, sleptAtM: null })).toEqual([]);
  });

  it("uses the bands altitude medicine uses", () => {
    expect(AMS_FLOOR_M).toBe(2_500);
  });
});

describe("the route's high point", () => {
  it("is the highest night", () => {
    expect(routeHigh([{ altitude_m: 840 }, { altitude_m: 4_450 }, { altitude_m: 2_810 }])).toBe(4_450);
  });

  it("is null for a route with no stops", () => {
    expect(routeHigh([])).toBeNull();
  });
});
