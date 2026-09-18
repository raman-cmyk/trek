/**
 * Which finished trip to ask about, and when to stop asking.
 *
 * A review is the only thing a guide is paid in besides money, and nothing on
 * this platform has ever asked for one. The single nudge that exists is an
 * email fired once when the trip is marked complete — on a mail channel that
 * has never successfully sent anything.
 *
 * Pure, because the two rules worth getting right are both judgement calls
 * about people rather than queries: which trip, and how many times to ask.
 */

export interface FinishedTrip {
  bookingId: string;
  title: string;
  guideFirstName: string;
  /** Last day of the trek. */
  endDate: string | null;
}

/** How long after a trip we stop bringing it up. */
export const ASK_WINDOW_DAYS = 90;

/**
 * The one to ask about.
 *
 * The most recent finished trip, not the oldest: it is the one they remember,
 * and a review written from a clear memory is worth more to the next trekker
 * than one scraped out of a trip last spring.
 *
 * Nothing older than the window. Being asked in March about a walk in October
 * is not a nudge, it is a filing cabinet falling on somebody — and a review
 * written that late is mostly a guess.
 */
export function tripToReview(
  trips: FinishedTrip[],
  dismissed: string[],
  todayIso: string,
): FinishedTrip | null {
  const skip = new Set(dismissed.filter(Boolean));
  const fresh = (trips ?? [])
    .filter((t) => t.bookingId && !skip.has(t.bookingId))
    .filter((t) => withinWindow(t.endDate, todayIso));
  if (fresh.length === 0) return null;
  return [...fresh].sort((a, b) => String(b.endDate ?? "").localeCompare(String(a.endDate ?? "")))[0];
}

/**
 * Is this trip recent enough to ask about?
 *
 * A trip with no end date is let through: it finished, we just cannot say
 * when, and refusing to ask would lose the review over a missing column.
 */
export function withinWindow(endDate: string | null | undefined, todayIso: string): boolean {
  const end = String(endDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return true;
  const days = (Date.parse(`${todayIso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${end}T00:00:00Z`)) / 86_400_000;
  // A trip that has not ended yet cannot be reviewed, but the query that feeds
  // this only returns completed ones — so a negative here is a date typo, not
  // a reason to hide.
  return days <= ASK_WINDOW_DAYS;
}

/** What the sheet says. Their guide's name, because that is who it is about. */
export function promptLines(trip: FinishedTrip): { title: string; body: string } {
  return {
    title: `How was ${trip.title}?`,
    body:
      `${trip.guideFirstName} walked it with you. A few lines from you is how the ` +
      `next person decides to trust them — and it stays hidden until they have ` +
      `reviewed you too.`,
  };
}
