/**
 * One live request per trekker, per trip, per date.
 *
 * A guide looking at two identical rows — same trek, same dates, same person —
 * cannot tell which to accept, and accepting both books the same fortnight
 * twice. Three things have to agree for that to be impossible:
 *
 *   1. this check, before the insert;
 *   2. the partial unique indexes in 0072, because check-then-insert is not
 *      atomic and the real cause is a double-tap sending two at once;
 *   3. `clashingDays` at accept time, for the days rather than the request.
 *
 * A finished request — declined, expired, withdrawn, or a booking that fell
 * through — is not a duplicate. Asking again after a no is a normal thing to
 * do, and the guards are careful to allow it.
 */

/** Enquiry statuses that still expect an answer. */
export const LIVE_ASK_STATUSES = ["open", "quoted"] as const;

/** Cancelled bookings free the trip and the dates up again. */
export function isCancelledBooking(status: string | null | undefined): boolean {
  return String(status ?? "").startsWith("cancelled");
}

export type AskOutcome = "send" | "already-asked" | "already-booked";

/**
 * What to do with an ask, given what the trekker already has for this exact
 * trip and date. The booking wins the tie: "you already have this booked" is
 * more useful than "you already asked", and a booking implies the ask.
 */
export function askOutcome(existing: {
  liveEnquiryId?: string | null;
  bookingStatus?: string | null;
}): AskOutcome {
  if (existing.bookingStatus && !isCancelledBooking(existing.bookingStatus)) {
    return "already-booked";
  }
  if (existing.liveEnquiryId) return "already-asked";
  return "send";
}

/**
 * Did the database refuse this as a duplicate?
 *
 * 23505 is unique_violation. When 0072's index catches a double-tap the loser
 * gets this, and the honest answer is the same one the pre-check gives: you
 * have already asked. It is not an error worth showing anybody.
 */
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return String(code ?? "") === "23505";
}
