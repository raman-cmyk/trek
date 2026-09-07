/**
 * What a guide is interesting for.
 *
 * A licence says somebody may lead a trek. It says nothing about whether they
 * know the birds, cook, carry a real camera, or are the person you want when
 * your fourteen-year-old is struggling on day four. That is what a trekker is
 * actually choosing between, and until now the only place it could live was a
 * sentence of free text nobody could filter on.
 *
 * A closed list, deliberately. Free-text tags give you "Photography",
 * "photography", "photos" and "Photographer" for the same thing, and then a
 * filter returns a quarter of the people it should. Adding to this list is a
 * product decision, which is the right amount of friction.
 *
 * The wording is a guide's, not a marketer's: every label is a thing somebody
 * could say out loud about themselves without embarrassment.
 */

export interface SkillGroup {
  key: string;
  label: string;
  skills: Array<{ key: string; label: string }>;
}

export const SKILL_GROUPS: SkillGroup[] = [
  {
    key: "know",
    label: "What you know",
    skills: [
      { key: "birds", label: "Birds and wildlife" },
      { key: "plants", label: "Plants and medicinal herbs" },
      { key: "mountains", label: "The mountains — how they were made" },
      { key: "monasteries", label: "Monasteries, festivals and what they mean" },
      { key: "history", label: "The history of the villages you pass" },
      { key: "night_sky", label: "The night sky" },
      { key: "weather", label: "Reading the weather off the ridge" },
      { key: "tracks", label: "Animal tracks and where to look" },
    ],
  },
  {
    key: "do",
    label: "What you do on the trail",
    skills: [
      { key: "photography", label: "Photography — you carry a real camera" },
      { key: "video", label: "Filming — people go home with a film" },
      { key: "cooking", label: "Cooking, and where to eat well" },
      { key: "music", label: "Songs and stories in the evening" },
      { key: "climbing", label: "Technical climbing and peaks" },
      { key: "rivers", label: "Rivers and rafting" },
      { key: "yoga", label: "Yoga and meditation" },
      { key: "foraging", label: "Wild food — what you can pick and eat" },
    ],
  },
  {
    key: "who",
    label: "Who you are good with",
    skills: [
      { key: "first_timers", label: "First-timers — you go slow" },
      { key: "families", label: "Families with children" },
      { key: "solo_women", label: "Women trekking alone" },
      { key: "older", label: "Trekkers over sixty" },
      { key: "nervous", label: "People frightened of the altitude" },
      { key: "fast", label: "Fit trekkers who want a hard itinerary" },
      { key: "vegetarian", label: "Vegetarians and vegans" },
      { key: "big_groups", label: "Big groups — eight and up" },
      { key: "students", label: "Students and small budgets" },
    ],
  },
  {
    key: "how",
    label: "How you work",
    skills: [
      { key: "plain_english", label: "Plain, slow English — nobody left guessing" },
      { key: "family_updates", label: "A message home to their family each night" },
      { key: "quiet", label: "Quiet walking — you know when not to talk" },
      { key: "winter", label: "Winter and the shoulder seasons" },
      { key: "monsoon", label: "Monsoon trekking — you know where it still works" },
      { key: "long_days", label: "Long days, early starts" },
    ],
  },
  {
    key: "bring",
    label: "What you bring",
    skills: [
      { key: "village_host", label: "A night in your own village" },
      { key: "first_aid", label: "Wilderness first aid" },
      { key: "altitude_medicine", label: "High-altitude medicine" },
      { key: "porters", label: "Porters you have worked with for years" },
      { key: "off_route", label: "Trails that are not on the map" },
      { key: "gear_lending", label: "Gear to lend — jackets, bags, poles" },
      { key: "own_transport", label: "Your own jeep or driver" },
      { key: "teahouse_ties", label: "Teahouses that keep a room for you" },
    ],
  },
];

export const SKILLS = SKILL_GROUPS.flatMap((g) => g.skills);
const BY_KEY = new Map(SKILLS.map((s) => [s.key, s]));

/**
 * How many one guide may claim.
 *
 * Without a cap the honest guide ticks four and the optimistic one ticks
 * twenty-three, and the twenty-three-tick guide wins every filter. A limit is
 * what keeps this a claim rather than a checklist.
 */
export const MAX_SKILLS = 8;

export function skillLabel(key: string): string | null {
  return BY_KEY.get(key)?.label ?? null;
}

/** Keys we recognise, deduplicated, capped. Anything else is dropped. */
export function parseSkills(raw: Iterable<unknown>): string[] {
  const out: string[] = [];
  for (const v of raw) {
    const key = typeof v === "string" ? v.trim() : "";
    if (!BY_KEY.has(key) || out.includes(key)) continue;
    out.push(key);
    if (out.length >= MAX_SKILLS) break;
  }
  return out;
}
