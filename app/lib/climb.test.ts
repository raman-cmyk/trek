import { describe, expect, it } from "vitest";
import {
  CLIMB_INK,
  CLIMB_PAPER,
  CLIMB_ROUTES,
  PALETTE_STOPS,
  altAtScroll,
  contrastRatio,
  paletteAt,
} from "./climb";

describe("the palette ramp keeps its contrast promise", () => {
  it("every stop clears WCAG AA (4.5:1) with its assigned text pole", () => {
    for (const stop of PALETTE_STOPS) {
      const fg = stop.fg === "paper" ? CLIMB_PAPER : CLIMB_INK;
      const ratio = contrastRatio(stop.bg, fg);
      expect(ratio, `${stop.alt} m`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("paletteAt agrees with the stops' own fg assignment", () => {
    // The runtime picks fg by bg lightness; it must land on the same pole the
    // stop declares, or the tested pairs are not the rendered pairs.
    for (const stop of PALETTE_STOPS) {
      const p = paletteAt(stop.alt);
      const declared = stop.fg === "paper" ? CLIMB_PAPER : CLIMB_INK;
      expect(p.fg, `${stop.alt} m`).toEqual(declared);
    }
  });

  it("every altitude where the page rests text on the background is safe", () => {
    // Info sections hold a constant altitude — one of the waypoints. The
    // mid-ramp danger window (bg L 0.55–0.72) only occurs inside photo
    // sections, where text sits on a fixed scrim. So the binding set is the
    // waypoint altitudes of every configured route.
    for (const cfg of Object.values(CLIMB_ROUTES)) {
      const alts = [cfg.start.altitude, ...cfg.days.map((d) => d.altitude)];
      for (const alt of alts) {
        const p = paletteAt(alt);
        expect(contrastRatio(p.bg, p.fg), `${alt} m`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("the summit is the palest point and the valley the darkest", () => {
    expect(paletteAt(4773).bg[0]).toBeGreaterThan(paletteAt(3870).bg[0]);
    expect(paletteAt(1400).bg[0]).toBeLessThan(paletteAt(2470).bg[0]);
  });
});

describe("altAtScroll", () => {
  const segs = [
    { altFrom: 1460, altTo: 2470, top: 0, height: 1000 },
    { altFrom: 2470, altTo: 2470, top: 1000, height: 500 }, // info: holds
    { altFrom: 2470, altTo: 4773, top: 1500, height: 1000 },
  ];

  it("interpolates inside a climbing block", () => {
    expect(altAtScroll(segs, 500)).toBe(1965);
  });

  it("holds constant through an info block", () => {
    expect(altAtScroll(segs, 1250)).toBe(2470);
  });

  it("clamps before the first and after the last block", () => {
    expect(altAtScroll(segs, -50)).toBe(1460);
    expect(altAtScroll(segs, 99999)).toBe(4773);
  });
});

describe("the Langtang configuration", () => {
  const cfg = CLIMB_ROUTES["langtang-valley"];

  it("has exactly one summit day, and it is the highest", () => {
    const summits = cfg.days.filter((d) => d.summit);
    expect(summits).toHaveLength(1);
    const top = Math.max(...cfg.days.map((d) => d.altitude));
    expect(summits[0].altitude).toBe(top);
  });

  it("every day has an image, a placeholder, and something to say", () => {
    for (const d of cfg.days) {
      expect(d.image).toMatch(/^\/img\/climb\//);
      expect(d.blur).toMatch(/^data:image\/jpeg;base64,/);
      expect(d.text.length).toBeGreaterThan(40);
    }
  });
});
