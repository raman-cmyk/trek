/**
 * What you pay, when, and what happens if you cancel — said before booking.
 *
 * The offering page priced a trip to the rupee and then said nothing at all
 * about the deposit: a guest could not find out what percentage they were
 * about to be charged, when the rest was due, or what the full-payment rule
 * was, until they were inside checkout. The numbers existed (pricing.ts has
 * computed them all along); nothing put them on the page.
 *
 * Pure, and it takes its own money formatter, so the same sentences serve the
 * offering page, the enquiry confirmation and the emails without drifting.
 */

import {
  DEPOSIT_RATE,
  FULL_PAYMENT_WINDOW_DAYS,
  computeBalance,
  computeDeposit,
} from "./pricing";
import { BALANCE_CHARGE_DAYS_BEFORE } from "./config";

export interface PaymentPlan {
  /** Charged when the guide accepts and the trekker confirms. */
  depositUsdCents: number;
  /** The rest, charged automatically before departure. Zero when paid in full. */
  balanceUsdCents: number;
  /** 20, as a whole number, for saying "20%". */
  depositPct: number;
  /** True when the whole thing is due now — inside the full-payment window. */
  fullUpfront: boolean;
  /** The day the balance is taken. Null when there is no balance. */
  balanceDueDate: string | null;
  /** Days from the day of booking to the start. */
  daysUntilStart: number;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function paymentPlan(args: {
  totalUsdCents: number;
  startDate: string;
  /** Today, as a date. Passed in so this stays pure and testable. */
  today: string;
}): PaymentPlan {
  const daysUntilStart = Math.round(
    (Date.parse(`${args.startDate}T00:00:00Z`) - Date.parse(`${args.today}T00:00:00Z`)) /
      86_400_000,
  );
  const depositUsdCents = computeDeposit(args.totalUsdCents, daysUntilStart);
  const balanceUsdCents = computeBalance(args.totalUsdCents, depositUsdCents);
  return {
    depositUsdCents,
    balanceUsdCents,
    depositPct: Math.round(DEPOSIT_RATE * 100),
    fullUpfront: balanceUsdCents === 0,
    // The sweep charges the balance this many days before the start; if that
    // day has already gone the charge is due now, which is the full-payment
    // case and has no balance anyway.
    balanceDueDate:
      balanceUsdCents > 0 ? addDays(args.startDate, -BALANCE_CHARGE_DAYS_BEFORE) : null,
    daysUntilStart,
  };
}

/**
 * The deposit line: what is taken now.
 *
 * Percentage and amount together, because a guest asks both questions at
 * once — "how much, and is that all of it?"
 */
export function depositLine(plan: PaymentPlan, money: (cents: number) => string): string {
  if (plan.fullUpfront) {
    return `Pay ${money(plan.depositUsdCents)} in full when you book.`;
  }
  return `Pay a ${plan.depositPct}% deposit of ${money(plan.depositUsdCents)} when you book.`;
}

/** The balance line: what is taken later, and when. Null when there is none. */
export function balanceLine(
  plan: PaymentPlan,
  money: (cents: number) => string,
  fmtDate: (iso: string) => string,
): string | null {
  if (!plan.balanceDueDate || plan.balanceUsdCents <= 0) return null;
  return `The remaining ${money(plan.balanceUsdCents)} is charged on ${fmtDate(
    plan.balanceDueDate,
  )}, ${BALANCE_CHARGE_DAYS_BEFORE} days before you start.`;
}

/** Why the whole amount is due now, when it is. Null when it is not. */
export function fullPaymentReason(plan: PaymentPlan): string | null {
  if (!plan.fullUpfront) return null;
  if (plan.daysUntilStart < 0) return "That date has passed.";
  return `Trips starting within ${FULL_PAYMENT_WINDOW_DAYS} days are paid in full up front — yours starts in ${plan.daysUntilStart} ${
    plan.daysUntilStart === 1 ? "day" : "days"
  }.`;
}

/**
 * What a cancellation gets back, in the bands the policy actually uses.
 *
 * The page used to promise "cancel free until 30 days before", which is not
 * quite what happens: the card fee is not refundable, and nobody enjoys
 * finding that out on the day they cancel.
 */
export const REFUND_BANDS: ReadonlyArray<{ when: string; youGetBack: string }> = [
  { when: "30 days or more before you start", youGetBack: "everything except the card fee" },
  { when: "15 to 29 days before", youGetBack: "half of what you have paid" },
  { when: "7 to 14 days before", youGetBack: "a quarter of what you have paid" },
  { when: "less than 7 days before", youGetBack: "nothing — your guide has turned work away" },
];

/** If the guide cancels, or the mountain does. */
export const REFUND_IF_NOT_YOU =
  "If your guide cancels, or we call it off for weather or safety, you get everything back.";

/**
 * The deposit, in one line, for a reader who has not opened anything yet.
 *
 * `depositLine` is the sentence inside the panel; this is the subtitle on the
 * closed row — both numbers at once, because "pay a deposit" with no second
 * figure reads as a hidden balance.
 */
export function depositTeaser(
  plan: PaymentPlan,
  money: (cents: number) => string,
  fmtDate: (iso: string) => string,
): string {
  if (plan.fullUpfront) {
    return `${money(plan.depositUsdCents)} now — trips this soon are paid in full.`;
  }
  return `${money(plan.depositUsdCents)} now, ${money(plan.balanceUsdCents)} on ${fmtDate(
    plan.balanceDueDate!,
  )}.`;
}

/**
 * What a cancellation gets back, said once on the closed row.
 *
 * Derived from the first band rather than written out again, so the summary
 * cannot promise something the bands below it contradict.
 */
export const CANCELLATION_TEASER = `Cancel ${REFUND_BANDS[0].when.replace(
  " before you start",
  " before",
)} and you get ${REFUND_BANDS[0].youGetBack} back.`;
