/**
 * What the trekker still owes, and when it falls due.
 *
 * The booking page said "Paid so far: $0 of $1,284.68" and stopped there,
 * which tells the office a number but not a job. What it needs is the next
 * thing somebody has to pay, how much, by when, and whether that date has
 * already gone by.
 *
 * Counted from the payments rather than the booking's flags. A group pays in
 * shares recorded against the same booking, and the flags are what drift —
 * the balance sweep once charged an organiser's card for a trip five people
 * had already paid for, because `total − deposit` cannot see shares.
 */

import { outstandingUsdCents } from "~/lib/group-pay";
import { FULL_PAYMENT_WINDOW_DAYS } from "~/lib/pricing";

/** Auto-cancel for nonpayment, per docs/02 and the balance sweep. */
export const NONPAYMENT_CANCEL_DAYS = 10;

const DAY = 86_400_000;
const midnight = (iso: string) => Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface DuePayment {
  key: "deposit" | "balance" | "instalment" | "settled";
  label: string;
  amountUsdCents: number;
  /** null when nothing is owed, or when the date depends on nothing we store. */
  dueOn: string | null;
  /** Days from today to dueOn; negative once it has gone by. */
  daysAway: number | null;
  overdue: boolean;
  /** One line of what happens if it is not paid. Empty when nothing is owed. */
  consequence: string;
}

export interface BookingDue {
  totalUsdCents: number;
  collectedUsdCents: number;
  outstandingUsdCents: number;
  next: DuePayment;
}

export interface DueInput {
  status?: string | null;
  total_usd_cents?: number | null;
  deposit_usd_cents?: number | null;
  start_date?: string | null;
  hold_expires_at?: string | null;
  payments?: Array<{ type: string; amount_usd_cents: number; status: string }> | null;
  instalments?: Array<{ seq: number; amount_usd_cents: number; due_date: string; status: string }> | null;
}

export function bookingDue(b: DueInput, todayIso: string): BookingDue {
  const total = Math.max(0, Math.round(b.total_usd_cents ?? 0));
  const payments = b.payments ?? [];
  const outstanding = outstandingUsdCents(total, payments);
  const collected = total - outstanding;

  const nothing: DuePayment = {
    key: "settled",
    label: "Paid in full",
    amountUsdCents: 0,
    dueOn: null,
    daysAway: null,
    overdue: false,
    consequence: "",
  };

  const base = { totalUsdCents: total, collectedUsdCents: collected, outstandingUsdCents: outstanding };
  if (outstanding === 0) return { ...base, next: nothing };

  const at = (dueOn: string | null): Pick<DuePayment, "dueOn" | "daysAway" | "overdue"> => {
    if (!dueOn) return { dueOn: null, daysAway: null, overdue: false };
    const days = Math.round((midnight(dueOn) - midnight(todayIso)) / DAY);
    return { dueOn, daysAway: days, overdue: days < 0 };
  };

  // Nothing has been paid and the guide has said yes: the deposit is what
  // holds the dates, and the hold is what runs out.
  if (String(b.status) === "pending_deposit") {
    const deposit = Math.min(outstanding, Math.max(0, Math.round(b.deposit_usd_cents ?? 0)) || outstanding);
    return {
      ...base,
      next: {
        key: "deposit",
        label: deposit >= total ? "Full payment, to hold the dates" : "Deposit, to hold the dates",
        amountUsdCents: deposit,
        ...at(b.hold_expires_at ? String(b.hold_expires_at).slice(0, 10) : null),
        consequence: "The guide's calendar is released if this is not paid.",
      },
    };
  }

  // A plan takes precedence over the single balance: the next unpaid
  // instalment IS the next thing owed, and its own date is the date.
  const nextInstalment = (b.instalments ?? [])
    .filter((i) => i.status !== "paid" && i.status !== "cancelled")
    .sort((x, y) => x.due_date.localeCompare(y.due_date))[0];
  if (nextInstalment) {
    return {
      ...base,
      next: {
        key: "instalment",
        label: `Instalment ${nextInstalment.seq}`,
        amountUsdCents: nextInstalment.amount_usd_cents,
        ...at(nextInstalment.due_date),
        consequence: "Charged automatically to the card on file.",
      },
    };
  }

  // Otherwise the balance, charged fourteen days before the trek starts.
  const start = b.start_date ? String(b.start_date).slice(0, 10) : null;
  const dueOn = start ? iso(midnight(start) - FULL_PAYMENT_WINDOW_DAYS * DAY) : null;
  const daysToStart = start ? Math.round((midnight(start) - midnight(todayIso)) / DAY) : null;
  return {
    ...base,
    next: {
      key: "balance",
      label: "Balance",
      amountUsdCents: outstanding,
      ...at(dueOn),
      consequence:
        daysToStart !== null && daysToStart <= NONPAYMENT_CANCEL_DAYS
          ? `Inside ${NONPAYMENT_CANCEL_DAYS} days of the start — the trip auto-cancels for nonpayment.`
          : `Charged automatically ${FULL_PAYMENT_WINDOW_DAYS} days before the start.`,
    },
  };
}
