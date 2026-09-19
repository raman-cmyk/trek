/**
 * The five kinds of thing a guide can offer, and their names.
 *
 * There were five copies of this list — `KIND_LABEL` and `KIND_GLYPH` in
 * cards.tsx, `KINDS` in ExperienceForm, `CATEGORIES` in experiences.tsx and
 * `KINDS` again in home.tsx — three of them with different wording for the
 * same thing ("City", "City experience", "City"). One list now, in singular
 * and plural, because both readings are wanted: a chip on one experience says
 * "Day hike", and a guide's card says what they run, which is "Day hikes".
 *
 * Keep in step with the CHECK on `offerings.kind` (0002_catalog.sql:42) and
 * with `OfferingKind` in pipeline.ts.
 */

import type { OfferingKind } from "~/lib/pipeline";

export const OFFERING_KINDS: readonly OfferingKind[] = [
  "trek",
  "day_hike",
  "food_culture",
  "adventure",
  "city",
] as const;

/** One of them. "Day hike". */
export const OFFERING_KIND_LABEL: Record<string, string> = {
  trek: "Trek",
  day_hike: "Day hike",
  food_culture: "Food & culture",
  adventure: "Adventure",
  city: "City",
};

/** What somebody runs. "Day hikes". */
export const OFFERING_KIND_PLURAL: Record<string, string> = {
  trek: "Treks",
  day_hike: "Day hikes",
  food_culture: "Food & culture",
  adventure: "Adventure",
  city: "City walks",
};

/**
 * What this guide runs, for a card: the kinds they actually list, in a fixed
 * order, deduplicated.
 *
 * Ordered by `OFFERING_KINDS` rather than by whatever the query returned, so
 * two guides offering the same things read the same way down a grid — and
 * capped, because "Treks • Day hikes • Food & culture • Adventure • City
 * walks" is a second paragraph on a 360px card, not a line.
 */
export function kindsLine(kinds: Iterable<string>, max = 3): string {
  const have = new Set(kinds);
  const named = OFFERING_KINDS.filter((k) => have.has(k)).map((k) => OFFERING_KIND_PLURAL[k]);
  if (named.length === 0) return "";
  if (named.length <= max) return named.join(" · ");
  return `${named.slice(0, max).join(" · ")} +${named.length - max}`;
}

/**
 * Whatever the form sent, reduced to kinds we know.
 *
 * Order follows `OFFERING_KINDS` so two guides who tick the same boxes store
 * the same array, and duplicates are dropped rather than let through.
 */
export function parseGuideKinds(values: unknown): string[] {
  const raw = Array.isArray(values) ? values : values == null ? [] : [values];
  const picked = new Set(raw.filter((v): v is string => typeof v === "string"));
  return OFFERING_KINDS.filter((k) => picked.has(k));
}
