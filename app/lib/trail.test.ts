import { describe, expect, it } from "vitest";
import { layoutTrail, pickPins, pinSide, summitOf, trailArea, trailPath, type TrailStop } from "./trail";

const ebc: TrailStop[] = [
  { day: 1, place: "Lukla", altitude_m: 2860 },
  { day: 2, place: "Phakding", altitude_m: 2610 },
  { day: 3, place: "Namche", altitude_m: 3440 },
  { day: 5, place: "Tengboche", altitude_m: 3860 },
  { day: 7, place: "Dingboche", altitude_m: 4410 },
  { day: 9, place: "Lobuche", altitude_m: 4940 },
  { day: 10, place: "Gorak Shep", altitude_m: 5164 },
  { day: 11, place: "Kala Patthar", altitude_m: 5545 },
  { day: 13, place: "Namche", altitude_m: 3440 },
  { day: 14, place: "Lukla", altitude_m: 2860 },
];

describe("layoutTrail", () => {
  it("runs left to right by day and puts the summit highest", () => {
    const pts = layoutTrail(ebc);
    expect(pts[0].x).toBeLessThan(pts.at(-1)!.x);
    const top = pts.reduce((b, p) => (p.y < b.y ? p : b), pts[0]);
    expect(top.stop.place).toBe("Kala Patthar");
  });

  it("fills its own box, whatever the route's real height", () => {
    // Otherwise a Poon Hill loop is a flat line beside Everest.
    const low = layoutTrail([
      { day: 1, place: "A", altitude_m: 1000 },
      { day: 2, place: "B", altitude_m: 1300 },
      { day: 3, place: "C", altitude_m: 1000 },
    ]);
    expect(low[1].y).toBeCloseTo(16, 0);
    expect(low[0].y).toBeCloseTo(86, 0);
  });

  it("is deterministic, so server and browser draw the same line", () => {
    expect(layoutTrail(ebc)).toEqual(layoutTrail(ebc));
  });

  it("copes with one stop and none", () => {
    expect(layoutTrail([])).toEqual([]);
    const one = layoutTrail([{ day: 1, place: "A", altitude_m: 100 }]);
    expect(one).toHaveLength(1);
    expect(one[0].x).toBeCloseTo(50, 0);
  });

  it("stays inside the box", () => {
    for (const p of layoutTrail(ebc)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
  });
});

describe("trailPath", () => {
  it("starts at the first point and mentions every one", () => {
    const pts = layoutTrail(ebc);
    const d = trailPath(pts);
    expect(d.startsWith(`M${pts[0].x},${pts[0].y}`)).toBe(true);
    expect(d).toContain(`T${pts.at(-1)!.x},${pts.at(-1)!.y}`);
  });

  it("is empty for nothing", () => {
    expect(trailPath([])).toBe("");
  });
});

describe("pickPins", () => {
  it("always keeps the start, the top and the end", () => {
    const picked = pickPins(layoutTrail(ebc), 4).map((p) => p.stop.place);
    expect(picked[0]).toBe("Lukla");
    expect(picked).toContain("Kala Patthar");
    expect(picked.at(-1)).toBe("Lukla");
    expect(picked).toHaveLength(4);
  });

  it("spreads the rest rather than bunching them", () => {
    const picked = pickPins(layoutTrail(ebc), 5);
    const idx = picked.map((p) => p.index);
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]);
  });

  it("returns everything when there is room", () => {
    expect(pickPins(layoutTrail(ebc.slice(0, 3)), 4)).toHaveLength(3);
  });
});

describe("summitOf / pinSide", () => {
  it("finds the top", () => {
    expect(summitOf(ebc)?.place).toBe("Kala Patthar");
    expect(summitOf([])).toBeNull();
  });

  it("puts a label on the side with room", () => {
    expect(pinSide({ x: 90, y: 10, stop: ebc[0], index: 0 })).toBe("left");
    expect(pinSide({ x: 10, y: 10, stop: ebc[0], index: 0 })).toBe("right");
  });
});

describe("trailArea", () => {
  it("closes the line to the foot of the box so the ground is the same shape as the walk", () => {
    const pts = layoutTrail(ebc);
    const a = trailArea(pts);
    expect(a.startsWith(trailPath(pts))).toBe(true);
    expect(a.endsWith("Z")).toBe(true);
    expect(a).toContain(",100 ");
  });

  it("is nothing for fewer than two points", () => {
    expect(trailArea([])).toBe("");
    expect(trailArea(layoutTrail([{ day: 1, place: "A", altitude_m: 1 }]))).toBe("");
  });
});
