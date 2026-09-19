/**
 * What a card says about the guide who runs the trip.
 *
 * The line under the title used to read "per person · less in a group" on
 * every card, which is a pricing footnote — true of all of them, and so
 * carrying no information at all. On a platform whose whole argument is that
 * you pick a person, the scarcest thing a card can spend that line on is what
 * other people said about that person.
 *
 * The hard case is a guide with no reviews, and on a launching marketplace it
 * is not the hard case, it is the normal one. It said **"No reviews yet"**,
 * and a browse page printed that about thirty people at once. Read the way a
 * trekker reads it, thirty times down a page, it says "nobody has booked any
 * of these people" — we were paying to advertise our own emptiness.
 *
 * So there is no negative rung. Reviews if they exist, and otherwise the
 * strongest true thing we know about this person: a career, treks led here,
 * or the licence itself. If we somehow know none of those, the line is blank,
 * because nothing beats a sentence that costs us the sale. Never a fake
 * number, never a 0.0, never an apology.
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
  /** The standing this guide has instead. Null when there is a rating. */
  text: string | null;
}

/** Everything a card can offer in place of a review. */
export interface Standing {
  /** Years guiding before this platform existed. */
  years?: number | null;
  /** Treks actually completed through us. */
  treks?: number | null;
  /** Verification tier; 1 and up means licence and papers checked. */
  tier?: number | null;
}

/**
 * The line, from a rating that may not exist.
 *
 * The ladder, strongest first. Each rung is a fact about this person that a
 * trekker in Berlin would actually weigh:
 *
 *   4.9 (12)             what twelve people said
 *   8 treks led here     they have done this, through us, and we watched
 *   14 years guiding     a career that predates us — most guides' best fact
 *   Licensed and checked we have seen the papers, which is our whole promise
 *   (blank)              we know nothing yet, so we say nothing
 *
 * `years` accepts a second argument as a bare number for the callers that
 * only have that, so older call sites keep working.
 */
export function ratingLine(
  rating: CardRating | null | undefined,
  standing?: Standing | number | null,
): RatingLine {
  // A rating of zero reviews is not a rating. Some callers build the record
  // by guide id and hand back a default rather than omitting the key.
  if (rating && rating.count > 0 && Number.isFinite(rating.value)) {
    return { stars: rating.value, count: rating.count, text: null };
  }

  const s: Standing =
    typeof standing === "number" ? { years: standing } : (standing ?? {});
  const line = (text: string | null): RatingLine => ({ stars: null, count: 0, text });

  // Treks led through us beat years claimed to us: we watched these happen.
  if (s.treks && s.treks > 0) {
    return line(`${s.treks} ${s.treks === 1 ? "trek" : "treks"} led here`);
  }
  if (s.years && s.years > 0) {
    return line(`${s.years} ${s.years === 1 ? "year" : "years"} guiding`);
  }
  // The licence is the floor, and it is never nothing: it is the one thing
  // this platform exists to have checked.
  if (s.tier && s.tier > 0) return line("Checked, and we have met them");
  return line(null);
}

/** "4.9" — one decimal, always, so a column of them lines up. */
export function starText(value: number): string {
  return value.toFixed(1);
}

/** "(12)" / "(1 review)" for the screen reader, which needs the noun. */
export function reviewsLabel(count: number): string {
  return `${count} ${count === 1 ? "review" : "reviews"}`;
}
