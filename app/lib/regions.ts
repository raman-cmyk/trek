/**
 * The trekking regions of Nepal, as the office names them.
 *
 * The match page offered four — Khumbu, Annapurna, Langtang, Manaslu — plus
 * "Anywhere", so a trekker who wanted Mustang or Kanchenjunga had no way to
 * say so and got the general list instead. The docs have always had twelve.
 *
 * A region is not a column: "Everest / Khumbu" covers the routes the database
 * files under both Khumbu and Solukhumbu, and "Western & Far-Western" covers
 * Karnali and Sudurpashchim. So each region carries the `routes.region` values
 * it contains, and the mapping lives here rather than in a query nobody can
 * find.
 */

export interface TrekRegion {
  key: string;
  /** What a trekker reads. */
  label: string;
  /** Values of routes.region that belong to this region. */
  matches: string[];
  /** One line of why somebody chooses it. */
  blurb: string;
}

export const REGIONS: TrekRegion[] = [
  {
    key: "everest",
    label: "Everest / Khumbu",
    matches: ["Khumbu", "Solukhumbu"],
    blurb: "Base Camp, Gokyo, the Three Passes. Sherpa country.",
  },
  {
    key: "annapurna",
    label: "Annapurna",
    matches: ["Annapurna"],
    blurb: "The Circuit, Base Camp and Poon Hill. Teahouses all the way.",
  },
  {
    key: "langtang",
    label: "Langtang",
    matches: ["Langtang"],
    blurb: "Closest to Kathmandu, and still quiet.",
  },
  {
    key: "manaslu",
    label: "Manaslu",
    matches: ["Manaslu"],
    blurb: "Restricted area, so you walk it with far fewer people.",
  },
  {
    key: "mustang",
    label: "Mustang",
    matches: ["Mustang"],
    blurb: "Behind the Himalaya: desert, walled towns, Tibetan Buddhism.",
  },
  {
    key: "dolpo",
    label: "Dolpo",
    matches: ["Dolpa"],
    blurb: "Remote, high and hard to reach. For people who have done the rest.",
  },
  {
    key: "kanchenjunga",
    label: "Kanchenjunga",
    matches: ["Kanchenjunga"],
    blurb: "The far east, under the third-highest mountain on earth.",
  },
  {
    key: "makalu",
    label: "Makalu",
    matches: ["Makalu"],
    blurb: "Barun valley wilderness. Almost nobody goes.",
  },
  {
    key: "dhaulagiri",
    label: "Dhorpatan & Dhaulagiri",
    matches: ["Dhaulagiri"],
    blurb: "High passes and a hunting reserve, west of Annapurna.",
  },
  {
    key: "rolwaling",
    label: "Rolwaling",
    matches: ["Rolwaling"],
    blurb: "Between Langtang and Everest, over the Tashi Lapcha.",
  },
  {
    key: "west",
    label: "Western & Far-Western",
    matches: ["Karnali", "Sudurpashchim"],
    blurb: "Rara, Api, Badimalika. The part of Nepal nobody photographs.",
  },
  {
    key: "kathmandu",
    label: "Kathmandu Valley & short treks",
    matches: ["Kathmandu"],
    blurb: "A few days, or one. Temples, ridges and food.",
  },
];

export function regionByKey(key: string | null | undefined): TrekRegion | null {
  if (!key) return null;
  return REGIONS.find((r) => r.key === key) ?? null;
}

/**
 * The region a `routes.region` value belongs to.
 *
 * Unknown values return null rather than guessing: a route filed under
 * something the office has not grouped yet should fall out of the filter, not
 * into the wrong region.
 */
export function regionForRouteValue(value: string | null | undefined): TrekRegion | null {
  if (!value) return null;
  return REGIONS.find((r) => r.matches.includes(value)) ?? null;
}

/** Does this route's region value sit inside the chosen region? */
export function inRegion(routeValue: string | null | undefined, key: string | null): boolean {
  const region = regionByKey(key);
  if (!region) return true; // "Anywhere"
  return !!routeValue && region.matches.includes(routeValue);
}

/**
 * How many routes each region actually holds.
 *
 * The page shows every one of the twelve — a trekker looking for Rolwaling
 * should see that we know what Rolwaling is — but a chip that leads to nothing
 * is a dead end, so the count travels with it and the empty ones say so.
 */
export function countByRegion(
  routes: Array<{ region: string | null }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of REGIONS) out[r.key] = 0;
  for (const route of routes) {
    const region = regionForRouteValue(route.region);
    if (region) out[region.key] += 1;
  }
  return out;
}
