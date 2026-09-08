/**
 * Categories — the homepage rows, made by whoever runs the marketplace.
 *
 * They were a hard-coded list (app/lib/intents.ts): six rows, and a seventh
 * needed a developer and a deploy. Which guides to put in front of people is
 * a daily editorial judgement — a festival week, a route that suddenly has
 * four good guides on it, three people who all speak Hebrew — and it belongs
 * to the person running the marketplace.
 *
 * A guide is in as many categories as fit. Membership is a hand-pick, and a
 * category may also name a skill (0062), in which case everyone who claimed
 * that skill is in it too. Both at once is the normal case: pick the three you
 * want at the front, let the rest fill in behind them.
 */

export interface Category {
  id: string;
  slug: string;
  label: string;
  blurb: string | null;
  /** Everyone who ticked this skill is in, on top of the hand-picked. */
  auto_skill: string | null;
  live: boolean;
  sort: number;
  min_guides: number;
}

/** A guide, as far as this file is concerned. */
export interface CategorisableGuide {
  user_id: string;
}

/**
 * A url slug from a label somebody typed.
 *
 * Not clever: lowercase, letters and digits, single hyphens. The founder
 * types "Guides who host you in their village" and gets something that can
 * live in a URL without being asked a second question.
 */
export function slugifyCategory(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

export interface CategoryProblem {
  field: "label" | "slug" | "min_guides";
  message: string;
}

/** What stops this category being saved. Empty means it is fine. */
export function categoryProblems(input: {
  label: string;
  slug: string;
  min_guides: number;
}): CategoryProblem[] {
  const out: CategoryProblem[] = [];
  const label = input.label.trim();
  if (label.length < 2) {
    out.push({ field: "label", message: "Give the row a heading people would read." });
  }
  if (label.length > 80) {
    out.push({ field: "label", message: "That heading is too long for a row — 80 characters." });
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.slug)) {
    out.push({ field: "slug", message: "The web address needs letters, numbers and hyphens." });
  }
  if (!Number.isFinite(input.min_guides) || input.min_guides < 1 || input.min_guides > 12) {
    out.push({ field: "min_guides", message: "Between 1 and 12 guides." });
  }
  return out;
}

/**
 * Who is in a category: the hand-picked, then everyone with the skill.
 *
 * Order matters and is the whole reason this is a function rather than a SQL
 * union. The people chosen by hand come first, in the order they were given,
 * because that is the editorial act; everyone the skill swept in follows, in
 * whatever order the caller ranked them.
 */
export function membersOf<G extends CategorisableGuide>(
  category: Pick<Category, "auto_skill">,
  guides: G[],
  picked: Array<{ guide_id: string; sort: number }>,
  skillsByGuide: Record<string, string[]>,
): G[] {
  const byId = new Map(guides.map((g) => [g.user_id, g]));
  const rank = new Map(picked.map((p) => [p.guide_id, p.sort]));

  const hand = [...rank.keys()]
    .sort((a, b) => (rank.get(a) ?? 100) - (rank.get(b) ?? 100))
    .map((id) => byId.get(id))
    .filter((g): g is G => !!g);

  if (!category.auto_skill) return hand;

  const taken = new Set(hand.map((g) => g.user_id));
  const swept = guides.filter(
    (g) => !taken.has(g.user_id) && (skillsByGuide[g.user_id] ?? []).includes(category.auto_skill!),
  );
  return [...hand, ...swept];
}

/** Is this category ready to show a reader? */
export function categoryIsReady(category: Category, memberCount: number): boolean {
  return category.live && memberCount >= category.min_guides;
}

/** Live categories, in the order they were told to appear. */
export function orderCategories(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
}
