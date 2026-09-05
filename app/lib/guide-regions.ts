/**
 * The parts of Nepal a guide works in.
 *
 * Different from `home_district`, which is where they are *from*, and from
 * the routes they have walked, which is what they have specifically led. A
 * guide from Solukhumbu who runs Annapurna every autumn had no way to say so:
 * they were filed under one district and their reach was invisible.
 *
 * The list is the regions that actually exist on the `routes` table, so a
 * guide's claim lines up with the trek catalogue rather than being free text
 * nobody can filter on.
 */

export const REGIONS = [
  "Khumbu",
  "Annapurna",
  "Langtang",
  "Manaslu",
  "Mustang",
  "Dolpa",
  "Kanchenjunga",
  "Makalu",
  "Dhaulagiri",
  "Karnali",
  "Sudurpashchim",
] as const;

export type Region = (typeof REGIONS)[number];

/** The name a trekker would recognise, where it differs from the region's own. */
export const REGION_HINTS: Partial<Record<Region, string>> = {
  Khumbu: "Everest",
  Sudurpashchim: "Far west",
  Karnali: "Rara, Humla",
  Makalu: "Barun",
};

export function isRegion(s: unknown): s is Region {
  return typeof s === "string" && (REGIONS as readonly string[]).includes(s);
}

/**
 * Whatever the form sent, reduced to regions we know. Order follows REGIONS
 * so two guides who tick the same boxes store the same array, and duplicates
 * are dropped rather than allowed through.
 */
export function parseRegions(values: unknown): Region[] {
  const raw = Array.isArray(values) ? values : values == null ? [] : [values];
  const picked = new Set(raw.filter(isRegion));
  return REGIONS.filter((r) => picked.has(r));
}
