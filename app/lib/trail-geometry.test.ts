import { describe, expect, it } from "vitest";
import {
  elevationProfile,
  lineLength,
  placeAlongLine,
  pointAt,
  profileRange,
  segmentLength,
  type LngLat,
  type ProfilePoint,
} from "./trail-geometry";

// A straight east-west line at 28°N, the latitude of the Annapurnas.
const straight: LngLat[] = [
  [84.0, 28.0],
  [84.1, 28.0],
  [84.2, 28.0],
];

describe("segmentLength", () => {
  it("shrinks a degree of longitude with latitude", () => {
    const atEquator = segmentLength([0, 0], [1, 0]);
    const atNepal = segmentLength([84, 28], [85, 28]);
    expect(atNepal).toBeLessThan(atEquator);
    // cos(28°) ≈ 0.883
    expect(atNepal / atEquator).toBeCloseTo(0.883, 2);
  });

  it("is zero for a point on itself", () => {
    expect(segmentLength([84, 28], [84, 28])).toBe(0);
  });
});

describe("lineLength", () => {
  it("adds its segments", () => {
    const a = segmentLength(straight[0], straight[1]);
    expect(lineLength(straight)).toBeCloseTo(a * 2, 3);
  });

  it("is zero for a line with nothing in it", () => {
    expect(lineLength([])).toBe(0);
    expect(lineLength([[84, 28]])).toBe(0);
  });
});

describe("pointAt", () => {
  it("returns the ends at 0 and 1", () => {
    expect(pointAt(straight, 0)).toEqual([84.0, 28.0]);
    expect(pointAt(straight, 1)[0]).toBeCloseTo(84.2, 6);
  });

  it("measures by distance, not by vertex", () => {
    // A line whose second segment is ten times the first. Halfway along it by
    // distance is deep inside the long segment, not at the shared vertex —
    // the bug that bunches every face into the fiddly end of a trek.
    const lopsided: LngLat[] = [
      [84.0, 28.0],
      [84.1, 28.0],
      [85.1, 28.0],
    ];
    expect(pointAt(lopsided, 0.5)[0]).toBeGreaterThan(84.5);
  });

  it("clamps a fraction outside 0-1 rather than running off the end", () => {
    expect(pointAt(straight, -3)).toEqual([84.0, 28.0]);
    expect(pointAt(straight, 9)[0]).toBeCloseTo(84.2, 6);
  });

  it("survives a line with no length at all", () => {
    expect(pointAt([[84, 28], [84, 28]], 0.5)).toEqual([84, 28]);
  });

  it("has a sane answer for an empty line", () => {
    expect(pointAt([], 0.5)).toEqual([84, 28.4]);
  });
});

describe("placeAlongLine", () => {
  it("puts one person in the middle of the walk, not at an end", () => {
    const [p] = placeAlongLine(straight, 1);
    expect(p[0]).toBeCloseTo(84.1, 4);
  });

  it("spreads people evenly and in order", () => {
    const out = placeAlongLine(straight, 5);
    expect(out).toHaveLength(5);
    const xs = out.map((p) => p[0]);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 6);
  });

  it("keeps clear of both ends so nobody covers the trailhead or the summit", () => {
    const out = placeAlongLine(straight, 4);
    expect(out[0][0]).toBeGreaterThan(84.0);
    expect(out[out.length - 1][0]).toBeLessThan(84.2);
  });

  it("returns nothing rather than a pile for a line that cannot be walked", () => {
    expect(placeAlongLine([[84, 28]], 5)).toEqual([]);
    expect(placeAlongLine(straight, 0)).toEqual([]);
  });
});

describe("elevationProfile", () => {
  const stops: ProfilePoint[] = [
    { day: 1, place: "Lukla", altitudeM: 2860 },
    { day: 2, place: "Namche", altitudeM: 3440 },
    { day: 3, place: "Dingboche", altitudeM: 4410 },
    { day: 4, place: "Base Camp", altitudeM: 5364 },
    { day: 5, place: "Namche", altitudeM: 3440 },
  ];

  it("draws a path across the full width", () => {
    const p = elevationProfile(stops)!;
    expect(p.path.startsWith("M0 ")).toBe(true);
    expect(p.path).toContain("L100 ");
  });

  it("puts the highest stop at the top of the box", () => {
    const p = elevationProfile(stops)!;
    const peak = p.points.find((pt) => pt.point.place === "Base Camp")!;
    const lowest = p.points.find((pt) => pt.point.place === "Lukla")!;
    // SVG y grows downwards: the summit has the SMALLEST y.
    expect(peak.y).toBeLessThan(lowest.y);
  });

  it("names the high point and the range", () => {
    const p = elevationProfile(stops)!;
    expect(p.peak?.place).toBe("Base Camp");
    expect(p.highM).toBe(5364);
    expect(p.lowM).toBe(2860);
    expect(profileRange(p)).toBe("2,860 m → 5,364 m");
  });

  it("closes the area path to the floor so the fill is not a sliver", () => {
    const p = elevationProfile(stops)!;
    expect(p.area.endsWith("L100 100 L0 100 Z")).toBe(true);
  });

  it("pads so the peak stroke is not clipped", () => {
    const p = elevationProfile(stops, 6)!;
    expect(Math.min(...p.points.map((pt) => pt.y))).toBeCloseTo(6, 5);
  });

  it("does not divide by zero on a dead flat walk", () => {
    const flat = elevationProfile([
      { day: 1, place: "a", altitudeM: 1400 },
      { day: 2, place: "b", altitudeM: 1400 },
    ])!;
    expect(flat.points.every((p) => Number.isFinite(p.y))).toBe(true);
  });

  it("is null when there is nothing to draw", () => {
    expect(elevationProfile([])).toBeNull();
    expect(elevationProfile([{ day: 1, place: "a", altitudeM: 1400 }])).toBeNull();
  });

  it("ignores stops with no altitude rather than drawing them at sea level", () => {
    const p = elevationProfile([
      { day: 1, place: "a", altitudeM: 2860 },
      { day: 2, place: "unknown", altitudeM: 0 },
      { day: 3, place: "c", altitudeM: 3440 },
    ])!;
    expect(p.points).toHaveLength(2);
    expect(p.lowM).toBe(2860);
  });
});
