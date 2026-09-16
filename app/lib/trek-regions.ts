/**
 * Nepal's trekking regions, as pages search can find.
 *
 * "Things to do in Pokhara" and "trekking in Annapurna" are what people
 * actually type, and this site had no page for either — the regions existed
 * only as a filter value on `routes.region`, reachable through a query string
 * that search engines treat as one page.
 *
 * A region is a GROUP of `routes.region` values rather than a single one,
 * because the database splits by district in places a trekker does not:
 * Khumbu and Solukhumbu are one idea to somebody planning Everest, and
 * Karnali and Sudurpashchim are one idea to almost everybody.
 *
 * Slugs are what will be in the URL for years, so they are the plain English
 * name of the place — not the database's spelling of it.
 */

export interface TrekRegion {
  slug: string;
  /** What a person calls it. */
  name: string;
  /** The `routes.region` values that belong to it. */
  values: string[];
  /** One sentence, for the card and the meta description. */
  blurb: string;
  /** What somebody is really asking when they search for this place. */
  intent: string;
}

export const TREK_REGIONS: TrekRegion[] = [
  {
    slug: "everest",
    name: "Everest & Khumbu",
    values: ["Khumbu", "Solukhumbu"],
    blurb:
      "Base Camp, Kala Patthar, Gokyo and the Three Passes — the Sherpa heartland, and the treks most people mean when they say Nepal.",
    intent: "Base Camp, and the passes above it",
  },
  {
    slug: "annapurna",
    name: "Annapurna",
    values: ["Annapurna"],
    blurb:
      "The Circuit, Base Camp, Poon Hill and Mardi Himal — the widest range of lengths and grades in the country, all reachable from Pokhara.",
    intent: "A first trek, or a fortnight-long circuit",
  },
  {
    slug: "langtang",
    name: "Langtang",
    values: ["Langtang"],
    blurb:
      "The closest high valley to Kathmandu, rebuilt by the people who lost it in 2015, and still the quietest week you can walk in a week.",
    intent: "High mountains, close to Kathmandu",
  },
  {
    slug: "manaslu",
    name: "Manaslu",
    values: ["Manaslu"],
    blurb:
      "A restricted-permit circuit around the eighth-highest mountain on earth, with a fraction of the traffic of Annapurna.",
    intent: "A circuit without the crowds",
  },
  {
    slug: "mustang",
    name: "Mustang",
    values: ["Mustang"],
    blurb:
      "Beyond the Himalaya in the rain shadow — a Tibetan plateau landscape of red cliffs and walled towns, walkable through the monsoon.",
    intent: "Trekking in the monsoon, and Tibetan culture",
  },
  {
    slug: "kanchenjunga",
    name: "Kanchenjunga",
    values: ["Kanchenjunga"],
    blurb:
      "The far east, against the Sikkim border. Three weeks, two base camps, and villages that see a handful of trekkers a season.",
    intent: "The remotest long trek in Nepal",
  },
  {
    slug: "makalu",
    name: "Makalu",
    values: ["Makalu"],
    blurb:
      "The Barun valley into the fifth-highest mountain's base camp, through some of the least-walked forest in the Himalaya.",
    intent: "Wilderness, and almost nobody else",
  },
  {
    slug: "dhaulagiri",
    name: "Dhaulagiri",
    values: ["Dhaulagiri"],
    blurb:
      "A true circuit with no teahouses — camping, two high passes, and a French Col crossing that needs a guide who has done it before.",
    intent: "A camping expedition, not a teahouse walk",
  },
  {
    slug: "dolpo",
    name: "Dolpo",
    values: ["Dolpa"],
    blurb:
      "Shey Phoksundo's blue water and the old salt roads — high, dry, Tibetan, and the setting of the book half the people here have read.",
    intent: "Remote Tibetan Nepal, and Phoksundo lake",
  },
  {
    slug: "far-west",
    name: "The Far West",
    values: ["Karnali", "Sudurpashchim"],
    blurb:
      "Rara lake, Api base camp and Badimalika — the part of Nepal that almost no trekker reaches, and the guides who live there.",
    intent: "Nepal nobody else has walked",
  },
];

export function regionBySlug(slug: string): TrekRegion | null {
  return TREK_REGIONS.find((r) => r.slug === slug) ?? null;
}

/** Whether a `routes.region` value belongs to this region. */
export function inRegion(region: TrekRegion, value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return region.values.some((x) => x.toLowerCase() === v);
}

/** Which region a `routes.region` value belongs to, if any. */
export function regionFor(value: string | null | undefined): TrekRegion | null {
  return TREK_REGIONS.find((r) => inRegion(r, value)) ?? null;
}

/**
 * How many routes each region has, from real rows.
 *
 * Returned for every region including the empty ones, so a caller can decide
 * whether to show a region with nothing in it — hiding it here would make
 * that decision invisible.
 */
export function countRoutes(
  rows: { region: string | null }[],
): Map<string, number> {
  const out = new Map<string, number>(TREK_REGIONS.map((r) => [r.slug, 0]));
  for (const row of rows) {
    const r = regionFor(row.region);
    if (r) out.set(r.slug, (out.get(r.slug) ?? 0) + 1);
  }
  return out;
}
