/**
 * The price on a card is the price the page will quote.
 *
 * It was not. A card priced the trip with the guide fee split four ways —
 * `min(max_party, 4)` — while the trip page opens at the party the trip
 * allows, which is almost always one. On Pemba's Everest trek that is a
 * $630 guide fee shown as $157 and charged as $630: the card advertised a
 * number nobody could buy, and a reader who clicked felt the difference.
 *
 * So there is one figure, defined as "what this page will say when somebody
 * lands on it", and both surfaces read it from here.
 *
 * A group is cheaper per person, and that is worth selling — but on the trip
 * page, next to the slider that makes it true, not as a headline price that
 * changes the moment you look closer.
 */

import {
  computeExperiencePricing,
  hasBreakdown,
  type PriceBreakdown,
} from "./experience-pricing";

export interface Priceable {
  price_breakdown?: PriceBreakdown | null;
  price_usd_cents?: number | null;
  min_party?: number | null;
}

/** The party size the trip page opens with. */
export function openingParty(o: Priceable): number {
  const min = o.min_party ?? 1;
  return Number.isFinite(min) && min > 0 ? Math.trunc(min) : 1;
}

/**
 * Per person, all in, at the party the page opens with — the same arithmetic
 * the page runs, so the two cannot drift.
 *
 * Null when there is no price at all, which a card renders as nothing rather
 * than as free.
 */
export function listPriceUsdCents(o: Priceable): number | null {
  if (hasBreakdown(o.price_breakdown)) {
    return computeExperiencePricing(o.price_breakdown, openingParty(o)).perPersonUsdCents;
  }
  return o.price_usd_cents ?? null;
}
