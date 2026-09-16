/**
 * What a guide actually takes home, in the currency they think in.
 *
 * The application asked for a day rate "in US dollars", which is the wrong
 * question twice: a guide in Kathmandu quotes and is paid in rupees, and the
 * number they type is the one they will be held to. Converting in their head
 * to a currency they do not get paid in is how a rate ends up 30% out.
 *
 * The other half is that nobody typing a rate into a box knows what it means.
 * "NPR 5,000" is abstract; "a 14-day Everest trek = NPR 70,000 to you" is the
 * thing they are deciding about. Our fee rides on top of the package rather
 * than coming out of it, so the whole of this figure is theirs — which is the
 * single strongest sentence on the page, and it is only credible with a
 * number next to it.
 */
import { FX_RATE_NPR } from "~/lib/config";

export function nprFromUsdCents(usdCents: number): number {
  return Math.round((usdCents / 100) * FX_RATE_NPR);
}

export function usdCentsFromNpr(npr: number): number {
  return Math.round((npr / FX_RATE_NPR) * 100);
}

export interface RateRange {
  low: number;
  high: number;
  /** How many guides the range was taken from. */
  from: number;
}

/**
 * The middle half of what guides on this platform charge.
 *
 * The interquartile range rather than the full spread: min-to-max is
 * NPR 3,600–8,000, which tells an applicant nothing except that anything
 * goes. Rounded to the nearest hundred, because a hint that reads
 * "NPR 4,123–5,187" looks like a quote rather than a guide.
 */
export function rateRange(usdCentRates: (number | null | undefined)[]): RateRange | null {
  const npr = usdCentRates
    .filter((r): r is number => typeof r === "number" && r > 0)
    .map(nprFromUsdCents)
    .sort((a, b) => a - b);
  if (npr.length < 4) return null;
  const at = (p: number) => npr[Math.floor((npr.length - 1) * p)];
  const round = (n: number) => Math.round(n / 100) * 100;
  return { low: round(at(0.25)), high: round(at(0.75)), from: npr.length };
}

export interface Earnings {
  perDay: number;
  days: number;
  total: number;
}

/**
 * What a trek of this length pays, at this rate.
 *
 * No fee is taken off, and that is not a simplification: `TREK_FEE_PCT` is
 * charged to the trekker on top of the guide's fee, so this figure is the
 * whole of what the guide is owed. If that ever changes, this is the function
 * that has to change with it — which is why it is here and not inlined in a
 * component.
 */
export function earningsFor(nprPerDay: number, days: number): Earnings | null {
  if (!Number.isFinite(nprPerDay) || nprPerDay <= 0) return null;
  if (!Number.isFinite(days) || days <= 0) return null;
  return { perDay: Math.round(nprPerDay), days: Math.round(days), total: Math.round(nprPerDay) * Math.round(days) };
}

/** "NPR 70,000" — grouped the way a Nepali reader expects. */
export function formatNpr(n: number): string {
  return `NPR ${Math.round(n).toLocaleString("en-US")}`;
}
