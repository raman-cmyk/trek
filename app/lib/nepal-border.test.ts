import { describe, expect, it } from "vitest";
import { NEPAL_RING, NEPAL_OUTLINE, OUTSIDE_NEPAL } from "./nepal-border";

/**
 * The dimming mask cannot be checked by looking at it from this project's
 * sandbox: MapLibre parses geojson in a Web Worker, the worker does not run
 * here, and so NO geojson-backed layer ever draws — which is also the real
 * reason the trail lines have never appeared in a screenshot taken from this
 * environment. The founder's browser draws them fine.
 *
 * So the geometry is proved arithmetically instead. If Nepal contains
 * Kathmandu and excludes Delhi and Lhasa, the hole is in the right place.
 */

/** Ray casting. Only used by this test — the app never asks "is this inside". */
function inside(ring: [number, number][], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

describe("the Nepal ring", () => {
  it("is a closed ring", () => {
    expect(NEPAL_RING[0]).toEqual(NEPAL_RING[NEPAL_RING.length - 1]);
  });

  it("is made only of finite numbers", () => {
    for (const [lng, lat] of NEPAL_RING) {
      expect(Number.isFinite(lng)).toBe(true);
      expect(Number.isFinite(lat)).toBe(true);
    }
  });

  it("sits inside Nepal's real bounding box", () => {
    const lngs = NEPAL_RING.map((c) => c[0]);
    const lats = NEPAL_RING.map((c) => c[1]);
    // Nepal is roughly 80.0-88.2 E, 26.3-30.5 N.
    expect(Math.min(...lngs)).toBeGreaterThan(79.9);
    expect(Math.max(...lngs)).toBeLessThan(88.3);
    expect(Math.min(...lats)).toBeGreaterThan(26.2);
    expect(Math.max(...lats)).toBeLessThan(30.5);
  });

  it("contains Nepali places", () => {
    expect(inside(NEPAL_RING, 85.324, 27.717)).toBe(true); // Kathmandu
    expect(inside(NEPAL_RING, 83.98, 28.21)).toBe(true); // Pokhara
    expect(inside(NEPAL_RING, 86.713, 27.687)).toBe(true); // Lukla
    expect(inside(NEPAL_RING, 80.58, 29.28)).toBe(true); // far west
  });

  it("excludes places that are not Nepal", () => {
    expect(inside(NEPAL_RING, 77.21, 28.61)).toBe(false); // Delhi
    expect(inside(NEPAL_RING, 91.11, 29.65)).toBe(false); // Lhasa
    expect(inside(NEPAL_RING, 88.61, 27.33)).toBe(false); // Gangtok, Sikkim
    expect(inside(NEPAL_RING, 85.3, 25.6)).toBe(false); // Bihar, just south
  });

  it("has enough points to look like a border rather than a box", () => {
    expect(NEPAL_RING.length).toBeGreaterThan(120);
  });
});

describe("the mask", () => {
  const outer = OUTSIDE_NEPAL.geometry.coordinates[0];
  const hole = OUTSIDE_NEPAL.geometry.coordinates[1];

  it("is a box with Nepal punched out of it", () => {
    expect(OUTSIDE_NEPAL.geometry.coordinates).toHaveLength(2);
    expect(hole).toBe(NEPAL_RING);
  });

  it("covers far more than any of these maps can show, but is not the world", () => {
    const lngs = outer.map((c) => c[0]);
    const lats = outer.map((c) => c[1]);
    // Well past every border...
    expect(Math.min(...lngs)).toBeLessThan(76);
    expect(Math.max(...lngs)).toBeGreaterThan(92);
    expect(Math.min(...lats)).toBeLessThan(22);
    expect(Math.max(...lats)).toBeGreaterThan(34);
    // ...and nowhere near the whole planet, which silently fails to
    // tessellate once it is cut into tiles at low zoom.
    expect(Math.min(...lngs)).toBeGreaterThan(-180);
    expect(Math.max(...lngs)).toBeLessThan(180);
  });

  it("wholly contains the hole, or the dimming would have a gap at the edge", () => {
    const lngs = outer.map((c) => c[0]);
    const lats = outer.map((c) => c[1]);
    for (const [lng, lat] of NEPAL_RING) {
      expect(lng).toBeGreaterThan(Math.min(...lngs));
      expect(lng).toBeLessThan(Math.max(...lngs));
      expect(lat).toBeGreaterThan(Math.min(...lats));
      expect(lat).toBeLessThan(Math.max(...lats));
    }
  });

  it("closes its outer ring", () => {
    expect(outer[0]).toEqual(outer[outer.length - 1]);
  });

  it("offers the border on its own for the edge line", () => {
    expect(NEPAL_OUTLINE.geometry.coordinates).toHaveLength(1);
    expect(NEPAL_OUTLINE.geometry.coordinates[0]).toBe(NEPAL_RING);
  });
});
