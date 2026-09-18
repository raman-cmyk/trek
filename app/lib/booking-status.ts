/**
 * What a booking's status actually is, worked out from facts rather than
 * remembered from whoever wrote it last.
 *
 * Twelve places in this codebase write `status:` by hand. Each one knows the
 * transition it is making and nothing about the others, so a booking arrives
 * at a status by whichever path happened to run — and `active` is written by
 * exactly one of them, a drag on the ops kanban, which is why a trek that is
 * on the trail today can sit in the wrong column for a fortnight.
 *
 * This is not a generated column. Twelve writers, a check constraint and a
 * board people drag cards on make that a rewrite. It is one function they all
 * call instead of naming a status themselves: give it the facts, it returns
 * the status those facts imply.
 *
 * Pure and tested. `applyBookingStatus` in booking-status.server.ts is the
 * half that reads the facts and writes the answer.
 */

export const BOOKING_STATUSES = [
  "pending_deposit",
  "deposit_paid",
  "docs_pending",
  "confirmed",
  "active",
  "completed",
  "cancelled_trekker",
  "cancelled_guide",
  "cancelled_force_majeure",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const isCancelled = (s: string | null | undefined): boolean =>
  String(s ?? "").startsWith("cancelled");

export interface StatusFacts {
  /** What it says now — cancellations and the closed flag are read from it. */
  current: string | null | undefined;
  startDate?: string | null;
  endDate?: string | null;
  /** Deposit settled — a payment row, not somebody's memory of one. */
  depositPaid: boolean;
  /** Nothing left for the trekker to pay, group shares included. */
  outstandingUsdCents: number;
  /** Every traveller's passport and insurance verified (`documentsComplete`). */
  documentsComplete: boolean;
  /** Does this kind of booking need documents at all? */
  needsDocuments: boolean;
  /** The office closed the trek out — receipts in, trip locked. */
  closedOut?: boolean;
  todayIso: string;
}

const midnight = (iso: string) => Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);

/**
 * The status the facts imply.
 *
 * In order, and each rule is a fact rather than a flag:
 *
 * 1. **Cancelled wins.** Nothing un-cancels a trip, and a cancelled booking
 *    whose dates have since passed is still cancelled, not completed.
 * 2. **Completed** once the last day is behind us and the trip ran.
 * 3. **Active** once today is inside the window on a trip that was ready to
 *    go. Nothing writes this today except an ops drag.
 * 4. **Confirmed** when the papers are in and nothing is owed.
 * 5. **Docs pending** when money has moved and the papers have not.
 * 6. **Deposit paid**, and otherwise
 * 7. **Pending deposit.**
 */
export function deriveBookingStatus(f: StatusFacts): BookingStatus {
  if (isCancelled(f.current)) return f.current as BookingStatus;

  const today = midnight(f.todayIso);
  const start = f.startDate ? midnight(f.startDate) : null;
  const end = f.endDate ? midnight(f.endDate) : start;

  const paidUp = f.outstandingUsdCents <= 0;
  const papersIn = !f.needsDocuments || f.documentsComplete;
  const ready = f.depositPaid && paidUp && papersIn;

  // A trek that was never paid for does not become "completed" because its
  // date went by — it becomes a trip that never happened, and the sweep that
  // cancels it for nonpayment is what says so.
  if (end !== null && today > end && (ready || f.closedOut || f.current === "active")) {
    return "completed";
  }

  if (start !== null && end !== null && today >= start && today <= end && ready) {
    return "active";
  }

  if (ready) return "confirmed";
  // A trek between the deposit and confirmation is "docs_pending" the whole
  // way, including the stretch where the papers are in and only the balance
  // is outstanding. Not because it is still collecting documents then, but
  // because `BOOKING_ORDER` in pipeline.ts puts deposit_paid BEFORE
  // docs_pending, and a status that walks a card backwards down the board is
  // worse than one that is slightly early.
  if (f.depositPaid && f.needsDocuments) return "docs_pending";
  if (f.depositPaid) return "deposit_paid";
  return "pending_deposit";
}

/** How far along a status is, for "never move a card backwards" checks. */
const RANK: Record<string, number> = {
  pending_deposit: 0,
  deposit_paid: 1,
  docs_pending: 2,
  confirmed: 3,
  active: 4,
  completed: 5,
};

/**
 * May the office drag this card to that column?
 *
 * The pipeline's action writes whatever `next` the form carries, with no
 * whitelist — the only bound is the database's check constraint, so a card
 * can be dropped straight from "pending deposit" to "completed" and the
 * booking will say a trek nobody paid for is finished.
 *
 * The rule: the facts' own answer is always allowed, and so is anything
 * behind it — putting a card back is how a mistake is undone. Jumping AHEAD
 * of the facts needs a written reason, because that is somebody overriding
 * what the system can see, and in six months the question will be who.
 */
export function moveProblem(
  target: string,
  facts: StatusFacts,
  reason?: string | null,
): string | null {
  if (!BOOKING_STATUSES.includes(target as BookingStatus)) {
    return "That is not a status a trip can be in.";
  }
  if (isCancelled(target)) {
    return "Cancel the trip from the booking page — the refund has to be worked out.";
  }
  if (isCancelled(facts.current)) {
    return "This trip is cancelled. It cannot be moved back onto the board.";
  }

  const derived = deriveBookingStatus(facts);
  if (target === derived) return null;
  if ((RANK[target] ?? 0) < (RANK[derived] ?? 0)) return null;

  if (!reason || reason.trim().length < 3) {
    return `The trip's own facts say "${derived.replace(/_/g, " ")}". To move it on anyway, say why.`;
  }
  return null;
}
