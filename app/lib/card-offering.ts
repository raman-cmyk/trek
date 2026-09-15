/**
 * What a card on a grid actually needs, and nothing else.
 *
 * A browse page returned whole offering rows and React Router serialised every
 * one of them into the page so the client could hydrate: 42% of the
 * homepage's 354 KB was that payload. Most of it is never read. A card shows a
 * photograph, a title, a duration, a party range, a transport line and a
 * price — it never renders the summary, and it needs the `price_breakdown`
 * only to work out the from-price, which the server can do once instead of
 * shipping the whole object for the browser to redo.
 *
 * Six per cent of cold renders were dying with "Worker exceeded resource
 * limits". This is the half of that fix which is about the page being smaller
 * rather than cached longer.
 */

import { fromPerPersonUsdCents, hasBreakdown, type PriceBreakdown } from "./experience-pricing";

/** The fields a card row keeps. */
export interface CardOffering {
  id: string;
  slug: string;
  kind: string;
  title: string;
  days: number;
  min_party: number | null;
  max_party: number | null;
  transport: string[] | null;
  activity_level: string | null;
  cover_photo_url: string | null;
  guide_slug: string;
  guide_name: string;
  guide_avatar_url: string | null;
  guide_tier: number;
  route_slug?: string | null;
  route_name?: string | null;
  /** Worked out here, so the breakdown never has to travel. */
  from_usd_cents: number | null;
}

/**
 * The from-price for a row, computed once on the server.
 *
 * An experience's price is its packaged breakdown total (cheapest per person =
 * the largest sensible group), not day rate × days.
 */
export function fromPriceFor(o: {
  price_breakdown?: PriceBreakdown | null;
  price_usd_cents?: number | null;
  max_party?: number | null;
}): number | null {
  if (hasBreakdown(o.price_breakdown)) {
    return fromPerPersonUsdCents(o.price_breakdown, o.max_party ?? undefined);
  }
  return o.price_usd_cents ?? null;
}

/**
 * A database row, reduced to a card.
 *
 * Extra keys are dropped rather than passed through: the point is that adding
 * a column to the view does not silently add weight to every browse page.
 */
export function toCardOffering(row: Record<string, any>): CardOffering {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    days: row.days,
    min_party: row.min_party ?? null,
    max_party: row.max_party ?? null,
    transport: row.transport ?? null,
    activity_level: row.activity_level ?? null,
    cover_photo_url: row.cover_photo_url ?? null,
    guide_slug: row.guide_slug,
    guide_name: row.guide_name,
    guide_avatar_url: row.guide_avatar_url ?? null,
    guide_tier: row.guide_tier,
    route_slug: row.route_slug ?? null,
    route_name: row.route_name ?? null,
    from_usd_cents: fromPriceFor(row),
  };
}
