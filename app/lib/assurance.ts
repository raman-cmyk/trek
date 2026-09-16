/**
 * The three things a stranger needs to hear before they will book.
 *
 * Every competitor puts a row of these at the foot of a results page —
 * Withlocals runs "Feel confident in booking / Change of plans? / Pay your
 * way" — and the temptation is to copy the three slots and fill them with
 * whatever sounds reassuring. Two of those three would be a lie here:
 *
 *   "Easily reschedule your booking"  — we do not offer free rescheduling,
 *                                        and the founder said so explicitly.
 *   "Fast, secure checkout in your
 *    currency"                        — prices are USD only, and Stripe has
 *                                        no keys on the worker yet, so there
 *                                        is no checkout to be fast about.
 *
 * A promise a trekker discovers is false on the day it matters is worse than
 * no promise at all: it turns a refund into a complaint. So the slots are
 * filled from what the system actually does, and the two money claims are
 * produced by running the real refund engine rather than typed next to it —
 * if somebody moves a band, this row moves with it on the next deploy.
 */
import type { ChipGlyph } from "~/components/design/Chip";
import { depositFacts, freeCancellationLine } from "~/lib/policy-copy";

export interface Assurance {
  key: "cancel" | "deposit" | "guide";
  glyph: ChipGlyph;
  headline: string;
  detail: string;
  /** Where the full version of this claim lives. Every one of them has one. */
  href: string;
}

/**
 * What we can stand behind, in the order a trekker worries about it.
 *
 * Money back first, because that is the fear. Then how little is due now.
 * Then who is actually on the other end — which is the one thing on this list
 * an agency marketplace cannot say.
 */
export function assurances(): Assurance[] {
  const cancel = freeCancellationLine();
  const d = depositFacts();
  return [
    {
      key: "cancel",
      glyph: "check",
      headline: cancel.headline,
      detail: cancel.detail,
      href: "/cancellation",
    },
    {
      key: "deposit",
      glyph: "calendar",
      headline: `Pay ${d.depositPct}% to hold your dates`,
      detail: `The rest is due ${d.balanceDaysBefore} days before you leave, not today.`,
      href: "/cancellation",
    },
    {
      key: "guide",
      glyph: "people",
      headline: "You pick the guide, not an agency",
      detail: "Every guide here is licensed, and we have met them.",
      href: "/trust",
    },
  ];
}

/**
 * The card networks a USD charge through Stripe accepts.
 *
 * Listed once, here, rather than as a row of logo files: a badge wall is the
 * easiest thing on a site to leave stale, and half the badges competitors
 * show (Klarna, iDEAL) are region-specific methods that a US entity charging
 * in dollars does not get.
 */
export const CARD_NETWORKS = ["Visa", "Mastercard", "American Express", "Discover"] as const;

/** The wallets the Stripe Payment Element offers on a supporting device. */
export const WALLETS = ["Apple Pay", "Google Pay"] as const;

export interface PaymentNote {
  /** Whether to show any of this at all. */
  show: boolean;
  networks: readonly string[];
  wallets: readonly string[];
  /** Who holds the card number. Never us — worth saying, because it is true. */
  processor: string;
  note: string;
}

/**
 * What to say about payment, given whether payment actually works yet.
 *
 * Gated on Stripe being configured rather than on a hand-flipped flag, so
 * "We accept Visa" cannot appear on a site that cannot take a card. The day
 * the key lands on the worker, the row appears; until then it is absent
 * rather than aspirational.
 */
export function paymentNote(stripeConfigured: boolean): PaymentNote {
  return {
    show: stripeConfigured,
    networks: CARD_NETWORKS,
    wallets: WALLETS,
    processor: "Stripe",
    note: "Charged in US dollars. We never see your card number.",
  };
}
