/**
 * Which trek a guide is actually on right now.
 *
 * `/g/active` took the first booking with status 'active', ordered by start
 * date, and the guide dashboard took one with no ordering at all. Both are
 * wrong in the same way: a trek that ended in August and was never closed is
 * still 'active', and it sorts before the one happening today.
 *
 * So a guide on the trail in September, following "Open the trek" from their
 * own check-in screen, was shown a different party — including that party's
 * phone number and emergency contact. That is the failure this file exists to
 * prevent, and it is why the choice is a tested function rather than an
 * ORDER BY somebody can change without noticing.
 *
 * 'active' means "started and not yet closed". It does not mean "happening
 * now", and the two only coincide when every guide closes every trek on time.
 */

export interface TripWindow {
  id: string;
  startDate: string;
  endDate: string | null;
}

/**
 * The trek underway today, or the nearest thing to it.
 *
 * In order: the one whose dates contain today; then the one starting soonest
 * after today; then the one that ended most recently. Never an arbitrary row.
 */
export function pickActiveTrip<T extends TripWindow>(trips: T[], today: string): T | null {
  if (!trips.length) return null;

  const covering = trips
    .filter((t) => t.startDate <= today && (t.endDate ?? t.startDate) >= today)
    // Two treks at once should not happen, and if it does the guide needs the
    // one that started most recently — the one they are standing on.
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  if (covering.length) return covering[0];

  const upcoming = trips
    .filter((t) => t.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (upcoming.length) return upcoming[0];

  // All in the past and still open. The most recent one is the one worth
  // closing, and the one the guide will recognise.
  return [...trips].sort((a, b) =>
    (b.endDate ?? b.startDate).localeCompare(a.endDate ?? a.startDate),
  )[0];
}

/** Is this trek happening today? Used to tell "on the trail" from "unclosed". */
export function isUnderway(trip: TripWindow | null, today: string): boolean {
  if (!trip) return false;
  return trip.startDate <= today && (trip.endDate ?? trip.startDate) >= today;
}

/**
 * The link to one specific trek.
 *
 * Every "Open the trek" used to point at a bare /g/active, so a guide with
 * three open treks got the same one whichever they tapped. Naming the booking
 * is the actual fix; picking well is the fallback for when nobody named one.
 */
export function activeTripHref(bookingId?: string | null): string {
  return bookingId ? `/g/active?booking=${encodeURIComponent(bookingId)}` : "/g/active";
}
