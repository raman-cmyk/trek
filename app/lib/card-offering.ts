import { listPriceUsdCents } from "~/lib/list-price";
import type { PublicOffering } from "~/components/public/cards";

/**
 * An offering reduced to what a card actually draws.
 *
 * React Router serialises every loader return into the document so the browser
 * can hydrate with it. On the homepage that payload was 165 KB of a 407 KB
 * page — and most of it was never rendered. Each of the 56 offerings shipped
 * its `summary` (no card shows one) and its whole `price_breakdown` (a nested
 * object of priced lines) purely so the browser could recompute a number the
 * server had already worked out.
 *
 * That weight is not only bytes. The worker pays CPU to build and serialise
 * it, and Cloudflare killed 16 requests with "exceeded resources" in a single
 * hour yesterday — every one of them a cache miss that had to render for real.
 *
 * So the price is computed once, here, and the two heavy fields are dropped.
 * `from_usd_cents` is what the card shows; `listPriceUsdCents` stays the single
 * definition of that number, so the card and the trip page cannot disagree.
 */
export interface CardOffering {
  id: string;
  slug: string;
  kind: string;
  title: string;
  days: number;
  max_party?: number | null;
  cover_photo_url: string | null;
  guide_id?: string;
  guide_slug: string;
  guide_name: string;
  guide_avatar_url: string | null;
  guide_tier: number;
  guide_years_experience?: number | null;
  route_slug?: string | null;
  route_name?: string | null;
  /** Worked out on the server; the browser never sees a breakdown. */
  from_usd_cents: number | null;
}

export function toCardOffering(o: PublicOffering & { guide_id?: string }): CardOffering {
  return {
    id: o.id,
    slug: o.slug,
    kind: o.kind,
    title: o.title,
    days: o.days,
    max_party: o.max_party ?? null,
    cover_photo_url: o.cover_photo_url,
    guide_id: (o as any).guide_id,
    guide_slug: o.guide_slug,
    guide_name: o.guide_name,
    guide_avatar_url: o.guide_avatar_url,
    guide_tier: o.guide_tier,
    guide_years_experience: o.guide_years_experience ?? null,
    route_slug: o.route_slug ?? null,
    route_name: o.route_name ?? null,
    from_usd_cents: listPriceUsdCents(o),
  };
}
