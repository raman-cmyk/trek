/**
 * Double-blind review release (docs/01 F6): a review stays hidden until BOTH
 * sides submit, or 14 days pass. Pure decision helper so it's unit-testable.
 */
export const REVIEW_BLIND_DAYS = 14;

export interface ReviewRow {
  direction: "trekker_to_guide" | "guide_to_trekker";
  created_at: string;
  published_at: string | null;
}

/** Given a booking's reviews and "now", which unpublished ones should release? */
export function reviewsToRelease(
  reviews: ReviewRow[],
  nowIso: string,
): ReviewRow[] {
  const bothSubmitted =
    reviews.some((r) => r.direction === "trekker_to_guide") &&
    reviews.some((r) => r.direction === "guide_to_trekker");

  return reviews.filter((r) => {
    if (r.published_at) return false;
    if (bothSubmitted) return true;
    const ageDays =
      (Date.parse(nowIso) - Date.parse(r.created_at)) / 86_400_000;
    return ageDays >= REVIEW_BLIND_DAYS;
  });
}

// Sub-rating keys validated per direction (docs/01 F6).
export const SUBRATINGS: Record<string, string[]> = {
  trekker_to_guide: ["safety", "communication", "local_knowledge", "english", "pace", "value"],
  guide_to_trekker: ["fitness_honesty", "punctuality", "respect"],
};
