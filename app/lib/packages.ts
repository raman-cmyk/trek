import type { PriceBreakdown, PriceLine } from "~/lib/experience-pricing";

/**
 * The package a trip is actually sold as.
 *
 * An offering is a starting point, not a contract. Every real conversation
 * about a trek moves it — "add a day at Namche", "we'll take the bus instead
 * of the flight", "there are three of us now" — and until this existed the
 * only answers a guide had were yes and no. What was agreed then lived in
 * WhatsApp, and the booking stopped describing the trip.
 *
 * A package is the offering's own price breakdown with three kinds of change
 * applied: a different length, a different set of optional lines, and lines
 * the guide adds for this trip only. Everything downstream — checkout, the
 * contract, the payout — then prices it with exactly the function it already
 * uses for an offering, because the result is the same shape.
 *
 * Pure and tested: what somebody is about to be charged is not a thing to
 * work out inside a route handler.
 */

export interface PackageChoice {
  /** Trip length. Changing this re-multiplies every per-day line. */
  days: number;
  /** Which of the offering's optional lines are in the package. */
  includedOptionIds: string[];
  /** Lines the guide added for this trip alone (never touch the offering). */
  extraLines?: PriceLine[];
}

/** A line the trekker may tick on or off, priced as it will be charged. */
export interface OptionLine {
  id: string;
  label: string;
  /** Cost of this option for the whole party, at the party size asked for. */
  amountUsdCents: number;
}

const cents = (n: unknown) => Math.max(0, Math.round(Number(n) || 0));

/**
 * The package as the guide proposes it.
 *
 * An option the trekker chose stops being optional — it is part of what they
 * are buying, and a line marked optional is excluded from the headline price
 * everywhere else. One that was not chosen is dropped entirely rather than
 * left in as an extra, so an approved package lists exactly what is coming.
 */
export function composePackage(base: PriceBreakdown, choice: PackageChoice): PriceBreakdown {
  const days = Math.max(1, Math.round(choice.days));
  const chosen = new Set(choice.includedOptionIds ?? []);

  const lines = (base.lines ?? [])
    .filter((l) => !l.optional || chosen.has(l.id))
    .map((l) => (l.optional ? { ...l, optional: false } : l));

  const extras = (choice.extraLines ?? []).map((l, i) => ({
    ...l,
    id: l.id || `extra${i}`,
    amountUsdCents: cents(l.amountUsdCents),
    optional: false,
  }));

  return {
    ...base,
    days,
    lines: [...lines, ...extras],
  };
}

/** The optional lines an offering offers, in the order the guide wrote them. */
export function optionsOf(base: PriceBreakdown | null | undefined): PriceLine[] {
  return (base?.lines ?? []).filter((l) => l.optional);
}

/**
 * What changed, in the words a person would use.
 *
 * A proposal that says "$1,840" and nothing else is a number to argue with.
 * One that says "a day longer, and the gear hire you asked for" is a decision
 * somebody can make in ten seconds, which is the whole point of the screen it
 * appears on.
 */
export function describeChanges(
  before: { days: number; partySize: number; startDate: string; optionIds?: string[] },
  after: { days: number; partySize: number; startDate: string; optionIds?: string[] },
  labelOf: (id: string) => string = (id) => id,
): string[] {
  const out: string[] = [];

  if (after.days !== before.days) {
    const d = after.days - before.days;
    const n = Math.abs(d);
    out.push(
      d > 0
        ? `${n} day${n === 1 ? "" : "s"} longer — ${after.days} days instead of ${before.days}`
        : `${n} day${n === 1 ? "" : "s"} shorter — ${after.days} days instead of ${before.days}`,
    );
  }

  if (after.partySize !== before.partySize) {
    out.push(`For ${after.partySize} instead of ${before.partySize}`);
  }

  if (after.startDate !== before.startDate) {
    out.push(`Starting ${after.startDate} instead of ${before.startDate}`);
  }

  const was = new Set(before.optionIds ?? []);
  const now = new Set(after.optionIds ?? []);
  for (const id of now) if (!was.has(id)) out.push(`Added: ${labelOf(id)}`);
  for (const id of was) if (!now.has(id)) out.push(`Removed: ${labelOf(id)}`);

  return out;
}

/**
 * Lines the guide wrote for this trip that the offering never had — shown
 * separately from the changes above, because "a helicopter out from Lukla" is
 * not a tick box anyone could have ticked.
 */
export function describeExtras(extras: PriceLine[] | undefined): string[] {
  return (extras ?? []).map((l) => l.label).filter(Boolean);
}

/** Money moving in the direction a person cares about. */
export function priceMove(
  beforeTotalUsdCents: number,
  afterTotalUsdCents: number,
): { direction: "up" | "down" | "same"; diffUsdCents: number } {
  const diff = afterTotalUsdCents - beforeTotalUsdCents;
  return {
    direction: diff > 0 ? "up" : diff < 0 ? "down" : "same",
    diffUsdCents: Math.abs(diff),
  };
}
