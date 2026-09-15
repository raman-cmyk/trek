import { Link } from "react-router";
import { SmartImage } from "~/components/SmartImage";
import { useMoney } from "~/lib/currency-context";
import { angleOf } from "~/lib/offering-picker";
import { listPriceUsdCents } from "~/lib/list-price";
import { TierBadge } from "~/components/public/bits";

export interface RouteOperator {
  id: string;
  slug: string;
  kind: string;
  title: string;
  days: number | null;
  guide_slug: string;
  guide_name: string;
  guide_avatar_url: string | null;
  guide_tier: number;
  min_party?: number | null;
  max_party?: number | null;
  price_usd_cents?: number | null;
  price_breakdown?: unknown;
}

/**
 * Who sells this walk, and what each of them charges.
 *
 * This replaced a price breakdown — guide, permits, porters, fee, fund — which
 * is the right thing on a trip page, where it explains a real quote somebody
 * is about to pay, and the wrong thing here. A route page is where somebody
 * decides *who* to walk with, so the useful comparison is the one this
 * platform exists to make possible: the same route, the same permits, and
 * eight different people with names, rates and a sentence about how they do
 * it.
 *
 * Sorted by price, because that is the axis a reader came to this table for.
 * The cheapest is marked, and so is the one with the most days — a longer
 * itinerary on the same route is usually more acclimatisation, not padding,
 * and a reader choosing on price alone should see the trade.
 */
export function RouteOperators({
  offerings,
  routeName,
}: {
  offerings: RouteOperator[];
  routeName: string | null;
}) {
  const { m } = useMoney();
  if (!offerings?.length) return null;

  const rows = offerings
    .map((o) => ({
      o,
      price: listPriceUsdCents(o as any),
      angle: angleOf(o.title, routeName),
    }))
    .sort((a, b) => {
      if (a.price == null) return 1;
      if (b.price == null) return -1;
      return a.price - b.price;
    });

  const prices = rows.map((r) => r.price).filter((p): p is number => p != null);
  const cheapest = prices.length ? Math.min(...prices) : null;
  const longest = Math.max(...offerings.map((o) => o.days ?? 0));

  return (
    <section className="mt-12">
      <p className="text-caption uppercase tracking-[0.08em] text-muted">Who leads it</p>
      <h2 className="mt-2 font-display text-2xl text-ink">
        {offerings.length === 1
          ? "One guide runs this route"
          : `${offerings.length} guides run this route`}
      </h2>
      <p className="mt-1 max-w-[58ch] text-sm text-muted">
        Same trail, same permits, different people. The price is what each of
        them quotes per person — not a starting figure that changes when you
        open the page.
      </p>

      <ul className="mt-5 divide-y divide-line border-y border-line">
        {rows.map(({ o, price, angle }) => (
          <li key={o.id}>
            <Link
              to={o.kind === "trek" ? `/treks/${o.slug}` : `/experiences/${o.slug}`}
              prefetch="intent"
              className="group flex items-center gap-4 py-4 transition-colors hover:bg-mist"
            >
              <SmartImage
                src={o.guide_avatar_url ?? ""}
                alt={o.guide_name}
                width={48}
                height={48}
                className="size-12 shrink-0 rounded-full"
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <span className="truncate font-medium text-ink group-hover:text-moss">
                    {o.guide_name}
                  </span>
                  <TierBadge tier={o.guide_tier} static />
                </p>
                {/* The guide's own angle on the route — "at porter pace",
                    "women welcome" — which is the actual difference between
                    two rows that otherwise walk the same trail. */}
                <p className="truncate text-sm text-ink-soft">
                  {angle || o.title}
                </p>
              </div>

              <div className="hidden shrink-0 text-right sm:block">
                <p className="font-mono text-sm text-ink">
                  {o.days ? `${o.days} days` : "—"}
                </p>
                {o.days === longest && offerings.length > 1 && (
                  <p className="text-caption text-muted">most days on the trail</p>
                )}
              </div>

              <div className="shrink-0 text-right">
                <p className="font-mono font-medium text-ink">
                  {price != null ? m(price) : "Ask"}
                </p>
                <p className="text-caption text-muted">
                  {price != null && price === cheapest && offerings.length > 1
                    ? "lowest here"
                    : "per person"}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
