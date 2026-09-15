/**
 * The before-you-go answers, grouped by when they matter.
 *
 * Twelve accordions in one grey stack, each with an icon picked from whatever
 * the design system had spare — a tick for insurance and again for money, a
 * spark for rescue and again for food and again for charging. So the icons
 * said nothing, the rows were identical, and about eight thousand characters
 * of genuinely useful, route-specific answers sat behind twelve clicks that
 * nobody makes.
 *
 * The fix is not better icons. It is that these questions are not one list:
 * they belong to different moments of the same trip. What you settle before
 * you leave, what you live with on the trail, what you owe the people walking
 * with you, and what happens if it goes wrong. That is a real structure — it
 * encodes something true about the content rather than decorating it — and
 * once the answers are grouped they can simply be shown, which is the whole
 * point of a page that claims to give honest ones.
 *
 * Pure: the grouping and its order. Nothing here knows about markup.
 */

export interface BriefingSection {
  id: string;
  title: string;
  body: string[];
  bullets?: string[];
}

export interface Moment {
  key: string;
  /** The heading a reader sees. */
  label: string;
  /** One line on why these belong together. */
  blurb: string;
}

export const MOMENTS: Moment[] = [
  {
    key: "before",
    label: "Before you leave home",
    blurb: "Settle these while you still have wifi and a chemist.",
  },
  {
    key: "trail",
    label: "On the trail",
    blurb: "What the days are actually like, at this height.",
  },
  {
    key: "people",
    label: "The people walking with you",
    blurb: "A guide and often a porter. What that means, and what it costs.",
  },
  {
    key: "wrong",
    label: "If it goes wrong",
    blurb: "Rare, and the part worth reading twice.",
  },
];

/**
 * Which moment each answer belongs to.
 *
 * Keyed on the section ids `trek-knowledge` produces. An id this does not
 * know still appears — under "On the trail", the broadest of the four —
 * because a new answer silently vanishing from the page is worse than one
 * filed slightly wrong.
 */
const MOMENT_OF: Record<string, string> = {
  insurance: "before",
  permits: "before",
  papers: "before",
  layers: "before",
  feet: "before",
  head: "before",
  carry: "before",
  health: "before",
  altitude: "trail",
  sleeping: "trail",
  food: "trail",
  money: "trail",
  power: "trail",
  porters: "people",
  tipping: "people",
  culture: "people",
  responsible: "people",
  rescue: "wrong",
};

export const FALLBACK_MOMENT = "trail";

export function momentOf(id: string): string {
  return MOMENT_OF[id] ?? FALLBACK_MOMENT;
}

export interface BriefingGroup {
  moment: Moment;
  sections: BriefingSection[];
}

/**
 * The sections, in four groups, in the order of the trip.
 *
 * A moment with nothing in it is dropped rather than rendered as an empty
 * heading — on a short low-altitude route there may genuinely be nothing to
 * say about rescue above 5,000m. Within a group the original order is kept,
 * because `knowBeforeYouGo` already orders by what matters most for the route.
 */
export function groupBriefing(sections: BriefingSection[]): BriefingGroup[] {
  return MOMENTS.map((moment) => ({
    moment,
    sections: sections.filter((s) => momentOf(s.id) === moment.key),
  })).filter((g) => g.sections.length > 0);
}

/** How many answers this page is actually giving. Worth stating. */
export function briefingCount(sections: BriefingSection[]): number {
  return sections.length;
}
