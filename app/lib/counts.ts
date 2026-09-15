/**
 * Counting things out loud.
 *
 * Two bugs kept coming from the same place. "Everest Three Passes · 1 guides"
 * — a plural hardcoded because most rows have more than one. And a row with a
 * count of zero rendering *nothing at all*, so Mustang sat with no number
 * beside it while every other region had one, and a route with no guide yet
 * looked like a route whose count we had lost.
 *
 * Zero is a fact, not an absence. It gets words too.
 */
export function countWords(
  n: number | null | undefined,
  singular: string,
  plural = `${singular}s`,
  zero = `no ${plural} yet`,
): string {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  if (v === 0) return zero;
  return `${v.toLocaleString("en-US")} ${v === 1 ? singular : plural}`;
}

/** "11 guides", "1 guide", "no guides yet". */
export function guideCount(n: number | null | undefined): string {
  return countWords(n, "guide");
}

/** "4 journals", "1 journal", "none written up yet". */
export function journalCount(n: number | null | undefined): string {
  return countWords(n, "journal", "journals", "none written up yet");
}

/**
 * "See all 46 →", in one place.
 *
 * The homepage had five patterns for the same link — "All 46 →",
 * "See everyone →", "38 more →", "or browse all 49 guides →", "Search all 56 →"
 * — which reads as five different destinations rather than one habit.
 */
export function seeAll(n?: number | null, noun?: string): string {
  const v = typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
  if (v == null) return "See all →";
  const what = noun ? ` ${noun}` : "";
  return `See all ${v.toLocaleString("en-US")}${what} →`;
}
