/**
 * Which review goes on the front page.
 *
 * It was `reviews[0]` — the most recent one — and the most recent one was
 * four stars out of five about a yoga class. That is the single quotation a
 * first-time visitor reads, on a site selling fourteen days at altitude with
 * a stranger, and it was neither about a trek nor particularly warm.
 *
 * Newest is the wrong sort. A featured review has a job: it has to be the
 * kind of trip we are asking someone to book, it has to be enthusiastic
 * enough to be worth quoting, and it has to be long enough to say something.
 * Recency only breaks ties.
 *
 * This does not invent or edit anything — it picks. If nothing clears the
 * bar, it returns null and the section does not render, because an
 * unconvincing testimonial is worse than none.
 */

export interface Reviewable {
  id: string;
  overall: number;
  body: string | null;
  published_at: string;
  author_name?: string | null;
  author_country?: string | null;
  /** The kind of offering reviewed, where the caller has it. */
  kind?: string | null;
}

/** Below this, a quotation argues against us. */
export const MIN_STARS = 4.5;
/** Shorter than this is a rating, not a testimonial. */
export const MIN_BODY = 60;

/** The kinds that are the thing this platform is actually for. */
const TREK_KINDS = new Set(["trek", "day_hike"]);

export function scoreReview(r: Reviewable): number {
  const body = (r.body ?? "").trim();
  if (body.length < MIN_BODY) return -1;
  if (!Number.isFinite(r.overall) || r.overall < MIN_STARS) return -1;
  let score = r.overall * 100;
  // A multi-day trek beats a two-hour class, because that is the decision
  // being made on this page.
  if (r.kind && TREK_KINDS.has(r.kind)) score += 250;
  if (r.kind === "trek") score += 150;
  // Something to say beats something brief, with a ceiling so an essay does
  // not win on length alone.
  score += Math.min(body.length, 400) / 10;
  return score;
}

/**
 * The best of what we have, or nothing.
 *
 * Ties break on recency, so a page does change over time — it simply stops
 * changing to something worse.
 */
export function featuredReview<T extends Reviewable>(reviews: T[] | null | undefined): T | null {
  const scored = (reviews ?? [])
    .map((r) => ({ r, s: scoreReview(r) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) =>
      b.s - a.s || Date.parse(b.r.published_at) - Date.parse(a.r.published_at));
  return scored.length ? scored[0].r : null;
}
