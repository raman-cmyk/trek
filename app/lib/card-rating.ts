/**
 * What a card says about the guide who runs the trip.
 *
 * The line under the title used to read "per person · less in a group" on
 * every card, which is a pricing footnote — true of all of them, and so
 * carrying no information at all. On a platform whose whole argument is that
 * you pick a person, the scarcest thing a card can spend that line on is what
 * other people said about that person.
 *
 * The hard case is a guide with no reviews, and it is not rare: every guide
 * has none on their first day. A 0.0, or five empty stars, reads as a bad
 * guide rather than a new one — so a guide with nothing said about them yet
 * says exactly that, and the years they have been guiding carry the line
 * instead. Never a fake number, never a blank.
 */

export interface CardRating {
  value: number;
  count: number;
}

export interface RatingLine {
  /** The rating, when there is one. */
  stars: number | null;
  /** "(12)" — omitted when there is no rating. */
  count: number;
  /** What to read when there are no reviews yet. */
  text: string | null;
}

/**
 * The line, from a rating that may not exist.
 *
 * `years` is the fallback's evidence: "New here · 14 years guiding" is a
 * truthful thing to say about somebody with no reviews on this platform and
 * a career behind them, and it is what a trekker actually wants to know.
 */
export function ratingLine(
  rating: CardRating | null | undefined,
  years?: number | null,
): RatingLine {
  // A rating of zero reviews is not a rating. Some callers build the record
  // by guide id and hand back a default rather than omitting the key.
  if (rating && rating.count > 0 && Number.isFinite(rating.value)) {
    return { stars: rating.value, count: rating.count, text: null };
  }
  if (years && years > 0) {
    return {
      stars: null,
      count: 0,
      text: `New here · ${years} ${years === 1 ? "year" : "years"} guiding`,
    };
  }
  return { stars: null, count: 0, text: "No reviews yet" };
}

/** "4.9" — one decimal, always, so a column of them lines up. */
export function starText(value: number): string {
  return value.toFixed(1);
}

/** "(12)" / "(1 review)" for the screen reader, which needs the noun. */
export function reviewsLabel(count: number): string {
  return `${count} ${count === 1 ? "review" : "reviews"}`;
}
