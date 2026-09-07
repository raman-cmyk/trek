/**
 * Browse-by-intent — the homepage rows, and the `?intent=` filter on /guides
 * that they link to. Every row is a real search, so a row and its "see all"
 * link can never disagree.
 *
 * Most rows now filter on a skill a guide ticked (`guide_skills`, 0062) —
 * "I host you in my village" is a box, not a substring search for "aunty".
 * The keyword lists stay as the fallback: a guide who has claimed nothing can
 * still be found by their own words, which is better than being invisible
 * until they fill in a form.
 */

export interface Intent {
  key: string;
  /** Row heading — a human choice, not a category. */
  label: string;
  /** One line under it. */
  blurb: string;
  /**
   * The skill a guide ticks for this row (0062). When present it is the whole
   * filter: keywords stay only as the fallback for guides who claimed nothing.
   */
  skill?: string;
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
    skill: "village_host",
    label: "Guides who host you in their village",
    blurb: "A night in a family house instead of a lodge.",
    keywords: ["family house", "my village", "my own village", "my home", "my town", "aunty"],
  },
  {
    key: "slow",
    skill: "first_timers",
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
    skill: "photography",
    // Named for what the guides actually offer, not for the tag we wish we
    // had. One of them carries a camera; the others are the ones who will
    // wake you at four because the light is doing something.
    label: "Photographers, and guides up before dawn",
    blurb: "One carries a real camera. The rest will wake you for the light.",
    keywords: ["camera", "photo", "shoot", "at four", "at dawn", "sunrise"],
  },
  {
    key: "medical",
    skill: "first_aid",
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
