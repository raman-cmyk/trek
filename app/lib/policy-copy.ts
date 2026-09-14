/**
 * The cancellation policy, in words, generated from the code that actually
 * moves the money.
 *
 * "A 'View our Cancellation Policies' and 'Book With A deposit' section need
 * to show below the calendar in every experience."
 *
 * The policy already existed — as a refund matrix in policy.ts, invisible to
 * anybody deciding whether to book. A trekker in Berlin sending money to a
 * stranger in Nepal has one question underneath all the others, and it is
 * "what happens if I cannot come".
 *
 * Every row below is DERIVED by running the real engine, not typed out beside
 * it. A published policy that says 50% while the code refunds 25% is worse
 * than no published policy: it is a promise the platform breaks on the day it
 * matters most. This way the page cannot drift, and a change to the matrix
 * shows up here on the next deploy.
 */

import {
  BALANCE_AUTOCANCEL_DAYS_BEFORE,
  BALANCE_CHARGE_DAYS_BEFORE,
} from "~/lib/config";
import { DEPOSIT_RATE, FULL_PAYMENT_WINDOW_DAYS } from "~/lib/pricing";
import { computeCancellation, estimateStripeFeeUsdCents } from "~/lib/policy";

export interface RefundRow {
  /** "30 days or more before you leave" */
  when: string;
  /** "Everything back, less the card fee" */
  youGet: string;
  /** What the guide is paid for the time they held. Null when nothing. */
  guideGets: string | null;
}

/**
 * The bands, worked out on a round example so the percentages are checkable
 * rather than asserted. Uses $1,000 paid with a $600 guide fee — the shape of
 * a real fourteen-day trek — and states the result as a percentage.
 */
export function refundRows(): RefundRow[] {
  const paid = 100_000;
  const guideFee = 60_000;
  const run = (daysUntilStart: number) =>
    computeCancellation({
      totalPaidUsdCents: paid,
      guideFeeUsdCents: guideFee,
      daysUntilStart,
      reason: "trekker",
    });

  const pctOf = (n: number, of: number) => Math.round((n / of) * 100);

  const bands: { days: number; when: string }[] = [
    { days: 30, when: "30 days or more before you leave" },
    { days: 20, when: "15 to 29 days before" },
    { days: 10, when: "7 to 14 days before" },
    { days: 2, when: "Less than 7 days before" },
  ];

  return bands.map(({ days, when }) => {
    const o = run(days);
    const back = pctOf(o.refundToTrekkerUsdCents, paid);
    const guide = pctOf(o.guideCompensationUsdCents, guideFee);
    return {
      when,
      youGet:
        o.stripeFeesWithheldUsdCents > 0
          ? "Everything back, less the card processing fee"
          : back === 0
            ? "Nothing back"
            : `${back}% back`,
      guideGets: guide > 0 ? `Your guide is paid ${guide}% of their fee` : null,
    };
  });
}

/** The two cases where you are made whole whatever the date. */
export function alwaysRefundedRows(): { when: string; youGet: string }[] {
  const paid = 100_000;
  const both = (["guide", "force_majeure"] as const).map((reason) =>
    computeCancellation({
      totalPaidUsdCents: paid,
      guideFeeUsdCents: 60_000,
      daysUntilStart: 3,
      reason,
    }),
  );
  const [guideCancel, forceMajeure] = both;
  return [
    {
      when: "Your guide cancels",
      youGet:
        guideCancel.refundToTrekkerUsdCents === paid
          ? "Everything back, whatever the date. We carry the card fee, not you."
          : "A partial refund.",
    },
    {
      when: "An earthquake, a strike, a closed airport",
      youGet:
        forceMajeure.refundToTrekkerUsdCents === paid
          ? "Everything back, whatever the date. We carry the card fee."
          : "A partial refund.",
    },
  ];
}

export interface DepositFacts {
  depositPct: number;
  balanceDaysBefore: number;
  autoCancelDaysBefore: number;
  fullPaymentWindowDays: number;
}

export function depositFacts(): DepositFacts {
  return {
    depositPct: Math.round(DEPOSIT_RATE * 100),
    balanceDaysBefore: BALANCE_CHARGE_DAYS_BEFORE,
    autoCancelDaysBefore: BALANCE_AUTOCANCEL_DAYS_BEFORE,
    fullPaymentWindowDays: FULL_PAYMENT_WINDOW_DAYS,
  };
}

/** The one line that fits under a booking box. */
export function depositLine(f = depositFacts()): string {
  return `Pay ${f.depositPct}% to hold your dates. The rest is due ${f.balanceDaysBefore} days before you leave.`;
}

/**
 * How many days before departure you can still cancel and be made whole.
 *
 * Found by asking the engine rather than typed beside it: walk the days
 * inwards and stop at the last one where the refund is still everything you
 * paid, minus at most the card fee. If somebody moves the band, this number
 * moves with it on the next deploy.
 */
export function freeCancellationDays(): number {
  const paid = 100_000;
  const floor = paid - estimateStripeFeeUsdCents(paid);
  let best = 0;
  for (let d = 400; d >= 0; d--) {
    const o = computeCancellation({
      totalPaidUsdCents: paid,
      guideFeeUsdCents: 60_000,
      daysUntilStart: d,
      reason: "trekker",
    });
    if (o.refundToTrekkerUsdCents >= floor) best = d;
    else break;
  }
  return best;
}

/**
 * The line that goes beside the Book button.
 *
 * Says "free cancellation" because that is what a trekker is looking for, and
 * then says what is actually withheld in the same breath. A headline promise
 * with the exception buried on another page is the thing that turns a refund
 * into a complaint.
 */
export function freeCancellationLine(days = freeCancellationDays()): {
  headline: string;
  detail: string;
} {
  return {
    headline: `Free cancellation up to ${days} days before you leave`,
    detail: "Everything back except the card processing fee.",
  };
}
