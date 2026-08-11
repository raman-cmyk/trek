/**
 * Browse-by-intent — the homepage rows, and the `?intent=` filter on /guides
 * that they link to. Every row is a real search, so a row and its "see all"
 * link can never disagree.
 *
 * The keyword lists are honest scaffolding, not the end state. Properly this
 * is a tag table (`guide_tags`), so a guide picks "I host in my village" and
 * we filter on a column. Until guides have written enough `only_with_me`
 * lines to know what the real tags are, matching their own words is better
 * than making them choose from tags we invented. Noted in docs/BACKLOG.md.
 */

export interface Intent {
  key: string;
  /** Row heading — a human choice, not a category. */
  label: string;
  /** One line under it. */
  blurb: string;
  /** Words to look for in the guide's own text. */
  keywords?: string[];
  /** Or a facet we can filter properly. */
  gender?: "female";
  languages?: string[];
  /** Region words matched against routes, for the region-plus-facet rows. */
  region?: string;
}

export const INTENTS: Intent[] = [
  {
    key: "village",
    label: "Guides who host you in their village",
    blurb: "A night in a family house instead of a lodge.",
    keywords: ["family house", "my village", "my own village", "my home", "my town", "aunty"],
  },
  {
    key: "slow",
    label: "First-timer friendly — they go slow",
    blurb: "No hero pace. Nobody made to feel stupid for asking.",
    keywords: [
      "slow",
      "never rush",
      "porter speed",
      "class four",
      "understand every word",
      "no charge",
      "hours less",
    ],
  },
  {
    key: "women-annapurna",
    label: "Women guiding Annapurna",
    blurb: "Rare, and the reason a lot of solo travellers book at all.",
    gender: "female",
    region: "Annapurna",
  },
  {
    key: "languages",
    label: "Speak German, French or Japanese",
    blurb: "Past please and thank you — a whole trek in your language.",
    languages: ["German", "French", "Japanese"],
  },
  {
    key: "photographers",
    // Named for what the guides actually offer, not for the tag we wish we
    // had. One of them carries a camera; the others are the ones who will
    // wake you at four because the light is doing something.
    label: "Photographers, and guides up before dawn",
    blurb: "One carries a real camera. The rest will wake you for the light.",
    keywords: ["camera", "photo", "shoot", "at four", "at dawn", "sunrise"],
  },
  {
    key: "medical",
    label: "Trained for when it goes wrong",
    blurb: "A nurse, a Gurkha, a guide who checks your oxygen nightly.",
    keywords: ["nurse", "medicine", "oxygen", "Gurkha", "helicopter"],
  },
];

export function findIntent(key: string | null): Intent | null {
  return INTENTS.find((i) => i.key === key) ?? null;
}

/** Does a guide's own text hit any of the intent's keywords? */
export function matchesKeywords(
  g: { only_with_me?: string | null; hook_line: string | null; bio?: string | null },
  keywords: string[],
): boolean {
  const hay = `${g.only_with_me ?? ""} ${g.hook_line ?? ""} ${g.bio ?? ""}`.toLowerCase();
  return keywords.some((k) => hay.includes(k.toLowerCase()));
}

/** Regions offered as doorways on the homepage. */
export const REGIONS = [
  { name: "Khumbu", blurb: "Everest, Gokyo, the Three Passes" },
  { name: "Annapurna", blurb: "The circuit, Mardi, Poon Hill" },
  { name: "Langtang", blurb: "Closest to Kathmandu, rebuilt" },
  { name: "Manaslu", blurb: "Restricted, wild, Larkya La" },
  { name: "Mustang", blurb: "Behind the Himalaya, dry and Tibetan" },
] as const;
