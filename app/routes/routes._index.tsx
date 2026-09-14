import { Link } from "react-router";
import type { Route } from "./+types/routes._index";
import { pageMeta, breadcrumbLd, jsonLd, absoluteUrl } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { getRouteArticle } from "~/lib/content";
import { fromPerPersonUsdCents, type PriceBreakdown , hasBreakdown } from "~/lib/experience-pricing";
import { monthName } from "~/lib/match";
import { useMoney } from "~/lib/currency-context";
import { SmartImage } from "~/components/SmartImage";
import { RouteSearch } from "~/components/public/RouteSearch";
import { copy } from "~/lib/copy";
import {
  filterRoutes,
  isNarrowed,
  parseRouteFilters,
  routeFacets,
} from "~/lib/route-search";

export { publicCacheHeaders as headers } from "~/lib/cache-headers";


export function meta({ loaderData: data }: Route.MetaArgs) {
  return [
    ...pageMeta({
      title: "Nepal trekking routes — days, altitude, permits & real costs",
      description:
        "Every route we run: Everest Base Camp, Annapurna Circuit, Langtang, Manaslu, Gokyo and Mardi Himal — with honest difficulty, live permit costs, and the verified guides who lead them.",
      canonical: (data as any)?.canonical ?? "",
      // A searched page is the same 24 routes in a different order. The
      // canonical stays /routes and the filtered view is kept out of the
      // index rather than competing with it.
      noindex: (data as any)?.narrowed ?? false,
    }),
    jsonLd(
      breadcrumbLd([{ name: "Routes", url: (data as any)?.canonical ?? "" }]),
    ),
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);
  const filters = parseRouteFilters(new URL(request.url).searchParams);

  const [{ data: routes }, { data: offerings }] = await Promise.all([
    client
      .from("routes")
      .select(
        "id, slug, name, region, typical_days, max_altitude_m, difficulty, season_months, summary",
      )
      .order("typical_days", { ascending: false }),
    client
      .from("public_offerings")
      .select("route_id, guide_id, price_usd_cents, price_breakdown, max_party"),
  ]);

  const all = (routes ?? []).map((r) => {
    const own = (offerings ?? []).filter((o) => o.route_id === r.id);
    const guideCount = new Set(own.map((o) => o.guide_id)).size;
    let from: number | null = null;
    for (const o of own) {
      const bd = (o.price_breakdown ?? null) as PriceBreakdown | null;
      const price = hasBreakdown(bd)
        ? fromPerPersonUsdCents(bd, (o as any).max_party)
        : (o.price_usd_cents ?? null);
      if (price != null && (from == null || price < from)) from = price;
    }
    const article = getRouteArticle(r.slug);
    return {
      ...r,
      guideCount,
      fromUsdCents: from,
      hero: article?.hero ?? null,
      // The route's own summary where there is no article, so a card is never
      // blank underneath — and so a word that matched is a word you can see.
      teaser: article?.meta ?? r.summary ?? null,
    };
  });

  // Filtered here rather than in the query: there are two dozen routes, they
  // are all fetched to price them anyway, and the month and length rules are
  // easier to get right — and to test — in one place than as PostgREST.
  const cards = filterRoutes(all, filters);

  return {
    cards,
    total: all.length,
    filters,
    narrowed: isNarrowed(filters),
    facets: routeFacets(all),
    canonical: absoluteUrl(env.SITE_URL, "/routes"),
  };
}

function seasonLabel(months: number[] | null): string {
  if (!months || months.length === 0) return "";
  // Compress into "Mar–May · Oct–Nov" style ranges.
  const sorted = [...months].sort((a, b) => a - b);
  const ranges: Array<[number, number]> = [];
  for (const m of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && m === last[1] + 1) last[1] = m;
    else ranges.push([m, m]);
  }
  return ranges
    .map(([a, b]) =>
      a === b ? monthName(a).slice(0, 3) : `${monthName(a).slice(0, 3)}–${monthName(b).slice(0, 3)}`,
    )
    .join(" · ");
}

export default function RoutesIndex({ loaderData }: Route.ComponentProps) {
  const { cards, total, filters, narrowed, facets } = loaderData as any;
  const { m } = useMoney();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <p className="label text-muted">Routes</p>
      {/* The headline counts every route, searched or not: a reader who has
          just narrowed to three is not looking at a site with three routes
          on it. What they narrowed to is the line under the box. */}
      <h1 className="mt-2 font-display text-display-l text-ink">
        {copy.routes.countAll.replace("{total}", String(total))}
      </h1>
      <p className="mt-3 max-w-[62ch] text-ink-soft">
        Every route we run, with honest difficulty, live permit costs, and the
        named guides who lead it. Pick the mountain — then pick the human.
      </p>

      <RouteSearch
        filters={filters}
        regions={facets.regions}
        difficulties={facets.difficulties}
      />

      {narrowed && (
        <p className="mt-2 text-caption text-muted">
          {copy.routes.countMatching
            .replace("{shown}", String(cards.length))
            .replace("{total}", String(total))}
        </p>
      )}

      {cards.length === 0 && (
        <div className="mt-10">
          <p className="font-display text-xl text-ink">{copy.routes.noneHead}</p>
          <p className="mt-1 max-w-[52ch] text-muted">{copy.routes.noneBody}</p>
          <Link
            to="/routes"
            className="mt-3 inline-block rounded bg-pine px-4 py-2 text-sm font-medium text-paper hover:bg-moss"
          >
            {copy.routes.showAll.replace("{total}", String(total))}
          </Link>
        </div>
      )}

      {/* No empty grid holding its margin open under the "nothing matches"
          note — a page that ends in a gap reads as one that broke. */}
      {cards.length > 0 && (
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {cards.map((r: any) => (
          <Link
            key={r.slug}
            to={`/routes/${r.slug}`}
            prefetch="intent"
            className="group overflow-hidden rounded-card border border-border bg-card hover:shadow-card"
          >
            <SmartImage
              src={r.hero ?? ""}
              alt={`${r.name} trek`}
              width={800}
              height={360}
              className="h-40 w-full"
            />
            <div className="p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-xl text-ink group-hover:text-primary">
                  {r.name}
                </h2>
                {r.fromUsdCents != null && (
                  <span className="whitespace-nowrap font-mono text-sm text-ink">
                    from {m(r.fromUsdCents)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                {r.region} · {r.typical_days} days · to {r.max_altitude_m.toLocaleString("en-US")}m ·{" "}
                <span className="capitalize">{r.difficulty}</span>
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                Season: {seasonLabel(r.season_months)}
                {r.guideCount > 0 &&
                  ` · ${r.guideCount} verified guide${r.guideCount === 1 ? "" : "s"}`}
              </p>
              {r.teaser && (
                <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{r.teaser}</p>
              )}
            </div>
          </Link>
        ))}
      </div>
      )}

      <div className="mt-10 rounded-card border border-accent/30 bg-accent/5 p-5">
        <p className="text-ink">
          <span className="font-medium">Not sure which route?</span>{" "}
          <Link to="/match" className="text-primary hover:underline">
            Answer 5 questions
          </Link>{" "}
          and we'll match you with the guides — and routes — that fit.
        </p>
      </div>
    </main>
  );
}
