/**
 * The page climbs.
 *
 * A route page rebuilt around one idea: scroll position is elevation. The
 * reader starts warm and low, thins and cools as they climb, peaks at the
 * summit, and comes back down onto the choice of guide. This file holds the
 * parts that make that mechanical — the altitude→palette ramp, the scroll
 * timeline, and the per-route configuration — kept pure so the ramp's
 * contrast promise can be proven in a test rather than eyeballed.
 *
 * Built for Langtang first (see CLIMB_ROUTES). The other routes are meant to
 * be configuration on top of this file, not rewrites.
 */

export type LCH = [l: number, c: number, h: number];

export interface PaletteStop {
  alt: number;
  bg: LCH;
  /** Which pole the text takes at this stop. */
  fg: "paper" | "ink";
}

/** The two text poles. Text is only ever one of these — never a mid value. */
export const CLIMB_PAPER: LCH = [0.975, 0.012, 120];
export const CLIMB_INK: LCH = [0.16, 0.015, 240];

/**
 * The ramp. Subtropical forest at the bottom; sage and stone at the
 * treeline; pale cold blue-grey in the alpine; near-white at the summit.
 *
 * The bg lightness deliberately never *rests* between 0.55 and 0.72 — in that
 * window neither white nor ink clears 4.5:1. Interpolation passes through it,
 * but only across the full-viewport photograph sections, where every word on
 * screen sits on a fixed dark scrim rather than on the page background. The
 * test in climb.test.ts asserts ≥4.5:1 at every stop — every value the page
 * actually places text against.
 */
export const PALETTE_STOPS: PaletteStop[] = [
  { alt: 1400, bg: [0.3, 0.055, 152], fg: "paper" }, // humid forest
  { alt: 2200, bg: [0.37, 0.045, 147], fg: "paper" },
  { alt: 2900, bg: [0.44, 0.03, 165], fg: "paper" }, // treeline: sage going stone
  { alt: 3430, bg: [0.5, 0.022, 200], fg: "paper" }, // cold stone
  { alt: 3870, bg: [0.88, 0.012, 225], fg: "ink" }, // alpine pale
  { alt: 4300, bg: [0.93, 0.008, 230], fg: "ink" },
  { alt: 4773, bg: [0.975, 0.004, 240], fg: "ink" }, // the summit: near-white, silent
];

/** Accent: chartreuse in the green, glacier blue in the cold. */
const ACCENT_LOW: LCH = [0.9, 0.16, 115];
const ACCENT_HIGH: LCH = [0.62, 0.09, 235];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpLch = (a: LCH, b: LCH, t: number): LCH => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

export function oklchCss([l, c, h]: LCH): string {
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(1)})`;
}

export interface ClimbPalette {
  bg: LCH;
  fg: LCH;
  accent: LCH;
}

/**
 * The palette at an altitude. bg interpolates through the stops; fg snaps
 * between the two poles at bg lightness 0.62 — by construction that snap
 * happens mid-photo, where no text reads against the page background.
 */
export function paletteAt(altM: number): ClimbPalette {
  const stops = PALETTE_STOPS;
  const a = Math.max(stops[0].alt, Math.min(altM, stops[stops.length - 1].alt));
  let i = 0;
  while (i < stops.length - 2 && stops[i + 1].alt < a) i++;
  const lo = stops[i];
  const hi = stops[i + 1];
  const t = (a - lo.alt) / Math.max(1, hi.alt - lo.alt);
  const bg = lerpLch(lo.bg, hi.bg, Math.max(0, Math.min(1, t)));
  const fg = bg[0] < 0.62 ? CLIMB_PAPER : CLIMB_INK;
  const at = (a - stops[0].alt) / (stops[stops.length - 1].alt - stops[0].alt);
  return { bg, fg, accent: lerpLch(ACCENT_LOW, ACCENT_HIGH, at) };
}

/* ── Contrast, provable ────────────────────────────────────────────────────
   OKLCH → sRGB → WCAG relative luminance, so the test can assert the ramp
   rather than trust it. */

function oklchToSrgb([L, C, H]: LCH): [number, number, number] {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const toGamma = (x: number) => {
    const v = Math.max(0, Math.min(1, x));
    return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  };
  return [toGamma(lr), toGamma(lg), toGamma(lb)];
}

function relLuminance(rgb: [number, number, number]): number {
  const lin = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrastRatio(a: LCH, b: LCH): number {
  const ya = relLuminance(oklchToSrgb(a));
  const yb = relLuminance(oklchToSrgb(b));
  const [hi, lo] = ya > yb ? [ya, yb] : [yb, ya];
  return (hi + 0.05) / (lo + 0.05);
}

/* ── The scroll timeline ─────────────────────────────────────────────────── */

export interface ClimbDayCfg {
  day: number;
  place: string;
  altitude: number;
  /** The image for this day's full-viewport frame. */
  image: string;
  blur: string;
  /** What actually happens that day — one or two sentences. */
  text: string;
  summit?: boolean;
}

export interface ClimbConfig {
  /** Where the walk starts — the hero's place and altitude. */
  start: { place: string; altitude: number; image: string; blur: string };
  days: ClimbDayCfg[];
  /** Days that are travel, compressed into one quiet line at the end. */
  coda?: string;
}

/**
 * Interpolate altitude across the day blocks for the altimeter.
 * `segments` is [altFrom, altTo, top, height] per block, in document order.
 */
export function altAtScroll(
  segments: Array<{ altFrom: number; altTo: number; top: number; height: number }>,
  focalY: number,
): number {
  if (segments.length === 0) return 0;
  const first = segments[0];
  if (focalY <= first.top) return first.altFrom;
  for (const s of segments) {
    if (focalY >= s.top && focalY < s.top + s.height) {
      const t = (focalY - s.top) / Math.max(1, s.height);
      return Math.round(s.altFrom + (s.altTo - s.altFrom) * t);
    }
  }
  return segments[segments.length - 1].altTo;
}

/**
 * Langtang Valley — the first, and for now only, climbing page.
 *
 * Images are generated landscape/trail photography (no people close enough
 * to carry a face — guide portraits stay reserved for real photographs).
 * Blur strings are 28px-wide jpegs, shown behind each image while it loads.
 */
const BLUR_1 =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABUOEBIQDRUSERIYFhUZHzQiHx0dH0AuMCY0TENQT0tDSUhUXnlmVFlyWkhJaY9qcnyAh4iHUWWUn5ODnXmEh4L/2wBDARYYGB8cHz4iIj6CVklWgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoL/wAARCAALABwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDEhkC/MprZsNXkRTknAHSubUkEYNdBpUaNYzFlBOOtAihdSPcyvJnJNU/KYdjVoDk/WrEX3KVx2P/Z";
const BLUR_2 =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABUOEBIQDRUSERIYFhUZHzQiHx0dH0AuMCY0TENQT0tDSUhUXnlmVFlyWkhJaY9qcnyAh4iHUWWUn5ODnXmEh4L/2wBDARYYGB8cHz4iIj6CVklWgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoL/wAARCAALABwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCCKe4lPJLHvmpCkzPjHGKkRQOQOaLF2ctuOcGlzNFctys8E3OVxVcrIpwBW9Iq+WeKz5AA3Sp5myuVI//Z";
const BLUR_3 =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABUOEBIQDRUSERIYFhUZHzQiHx0dH0AuMCY0TENQT0tDSUhUXnlmVFlyWkhJaY9qcnyAh4iHUWWUn5ODnXmEh4L/2wBDARYYGB8cHz4iIj6CVklWgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoL/wAARCAALABwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCjFGkgwchvpVhNP3fxgVZQALkAU1e9PmYcpA1gIxlmz9KYBEvBiJq9GetMf71HMwsf/9k=";
const BLUR_4 =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABUOEBIQDRUSERIYFhUZHzQiHx0dH0AuMCY0TENQT0tDSUhUXnlmVFlyWkhJaY9qcnyAh4iHUWWUn5ODnXmEh4L/2wBDARYYGB8cHz4iIj6CVklWgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoL/wAARCAALABwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDIRotvzZzVuA2wUlu9UgAUOR2qEEg8VdwNVXtIW5yRVpNS04Lgo2awxz15ppAz0p3YrH//2Q==";
const BLUR_5 =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABUOEBIQDRUSERIYFhUZHzQiHx0dH0AuMCY0TENQT0tDSUhUXnlmVFlyWkhJaY9qcnyAh4iHUWWUn5ODnXmEh4L/2wBDARYYGB8cHz4iIj6CVklWgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoL/wAARCAALABwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDnIZWQ8VpSOs0I3PhscCqNsoPJFLk7yc1LKRHIrLgEGm7GbmtW0UOCHGeO9VpVAkIApXHY/9k=";
const BLUR_6 =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABUOEBIQDRUSERIYFhUZHzQiHx0dH0AuMCY0TENQT0tDSUhUXnlmVFlyWkhJaY9qcnyAh4iHUWWUn5ODnXmEh4L/2wBDARYYGB8cHz4iIj6CVklWgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoL/wAARCAALABwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwBIdRXOGiOabPqcyt8o2is63divJzUoZiwyajmKHzahcSjaznHpTFuZUGFY4pM/vSPeopyRKQDVJk2P/9k=";

export const CLIMB_ROUTES: Record<string, ClimbConfig> = {
  "langtang-valley": {
    start: {
      place: "Syabrubesi",
      altitude: 1460,
      image: "/img/climb/langtang/day-6.jpg",
      blur: BLUR_6,
    },
    days: [
      {
        day: 1,
        place: "Lama Hotel",
        altitude: 2470,
        image: "/img/climb/langtang/day-1.jpg",
        blur: BLUR_1,
        text: "Into the gorge and it stays there all day — the Langtang Khola loud on your left, bamboo and leeches and langur monkeys, a thousand metres gained without one open view.",
      },
      {
        day: 2,
        place: "Langtang village",
        altitude: 3430,
        image: "/img/climb/langtang/day-2.jpg",
        blur: BLUR_2,
        text: "Out of the trees by mid-morning. You pass the memorial for the village lost in 2015, and then the rebuilt one just above it — every lodge here carries both dates.",
      },
      {
        day: 3,
        place: "Kyanjin Gompa",
        altitude: 3870,
        image: "/img/climb/langtang/day-3.jpg",
        blur: BLUR_3,
        text: "A short day on purpose. The valley opens completely, the monastery appears, and the afternoon is for cheese from the yak dairy and letting your blood catch up with the altitude.",
      },
      {
        day: 4,
        place: "Kyanjin Ri",
        altitude: 4773,
        image: "/img/climb/langtang/day-4.jpg",
        blur: BLUR_4,
        text: "Up at four, on the ridge by first light. The whole Langtang Lirung face at once. This is the day the other five exist for.",
        summit: true,
      },
      {
        day: 5,
        place: "Lama Hotel",
        altitude: 2470,
        image: "/img/climb/langtang/day-5.jpg",
        blur: BLUR_5,
        text: "The long descent — everything you climbed in two days, down in one. Knees complain; the air gets thick and warm and smells of trees again.",
      },
      {
        day: 6,
        place: "Syabrubesi",
        altitude: 1460,
        image: "/img/climb/langtang/day-6.jpg",
        blur: BLUR_6,
        text: "Out to the road. Hot springs if you want them, a long lunch, and the mountains already look like something you made up.",
      },
    ],
    coda: "Days 7–8 — the drive back to Kathmandu, with a buffer day for the road. The road decides, not the schedule.",
  },
};
