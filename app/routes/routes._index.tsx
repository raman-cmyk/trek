import { useMemo, useState } from "react";
import { FilterSheet } from "~/components/public/FilterSheet";
import { Link } from "react-router";
import type { Route } from "./+types/routes._index";
import { pageMeta, breadcrumbLd, jsonLd, absoluteUrl } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { getRouteArticle } from "~/lib/content";
import { NepalRouteMap } from "~/components/public/NepalRouteMap";
import { RouteCard, type RouteCardData } from "~/components/public/RouteCard";
import {
  GRADES,
  SORTS,
  lengthsOf,
  matches,
  monthsOf,
  resultHeading,
  priceSpread,
  profileOf,
  regionsOf,
  seasonLabel,
  sortCards,
  type SortKey,
} from "~/lib/route-cards";
import { Glyph } from "~/components/design/Chip";
import { BookingAssurance } from "~/components/public/BookingAssurance";

export { publicCacheHeaders as headers } from "~/lib/cache-headers";

/**
 * Every route we run, in one grid.
 *
 * The page used to be twenty-four identical cards under a map. The thing that
 * actually separates these walks — the shape of the climb — was on none of
 * them, and the price said "from $398" as though a route had a price rather
 * than ten guides each having one.
 *
 * So: each card carries its real elevation profile drawn from its own day
 * stops, a photograph where we have one, the route's own description, and the
 * range the guides who walk it actually charge. Filtering happens in the
 * browser over a list that server-renders complete, so the crawler and a
 * phone with no JavaScript both get all twenty-four.
 *
 * It used to be shelved by region, on the theory that a reader picks a
 * mountain first. Twelve regions over twenty-four routes meant **seven
 * shelves held exactly one route** — a heading, a rule and a lone card in a
 * three-wide row, seven times down the page — and the shelf counts disagreed
 * with the count in the filter bar because the shelves were built from the
 * list minus the three featured ones. Region is a filter now, alongside the
 * three other questions people actually ask of a trek: how hard, how long,
 * and what month they are coming.
 */
export function meta({ loaderData: data }: Route.MetaArgs) {
  return [
    ...pageMeta({
      title: "Nepal trekking routes — days, altitude, permits & real costs",
      description:
        "Every route we run: Everest Base Camp, Annapurna Circuit, Langtang, Manaslu, Gokyo and Mardi Himal — with honest difficulty, live permit costs, and the verified guides who lead them.",
      canonical: (data as any)?.canonical ?? "",
    }),
    jsonLd(breadcrumbLd([{ name: "Routes", url: (data as any)?.canonical ?? "" }])),
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);

  const [{ data: routes }, { data: offerings }, { count: guideCount }] = await Promise.all([
    client
      .from("routes")
      .select(
        "id, slug, name, region, typical_days, max_altitude_m, difficulty, season_months, summary, day_stops",
      )
      .order("max_altitude_m", { ascending: false }),
    client
      .from("public_offerings")
      .select(
        "route_id, guide_id, guide_slug, guide_name, guide_avatar_url, cover_photo_url, price_usd_cents, price_breakdown, max_party, min_party",
      ),
    client.from("public_guides").select("user_id", { count: "exact", head: true }),
  ]);

  const cards = (routes ?? []).map((r: any) => {
    const own = (offerings ?? []).filter((o: any) => o.route_id === r.id);
    const spread = priceSpread(own as any);
    const article = getRouteArticle(r.slug);

    // One face per guide, in the order they appear, deduped.
    const seen = new Set<string>();
    const faces = [];
    for (const o of own as any[]) {
      if (!o.guide_slug || seen.has(o.guide_slug)) continue;
      seen.add(o.guide_slug);
      faces.push({
        slug: o.guide_slug,
        name: o.guide_name ?? "Guide",
        avatar: o.guide_avatar_url ?? null,
      });
      if (faces.length === 4) break;
    }

    // A photograph if anyone has given us one: the route's own article hero
    // first, then whatever a guide put on their trip.
    const photo =
      article?.hero ??
      (own as any[]).find((o) => o.cover_photo_url)?.cover_photo_url ??
      null;

    return {
      slug: r.slug,
      name: r.name,
      region: r.region,
      typical_days: r.typical_days,
      max_altitude_m: r.max_altitude_m,
      difficulty: String(r.difficulty ?? ""),
      summary: r.summary ?? article?.meta ?? null,
      season: seasonLabel(r.season_months),
      season_months: r.season_months ?? [],
      photo,
      profile: profileOf(r.day_stops),
      lo: spread.lo,
      hi: spread.hi,
      guides: spread.guides,
      faces,
    } satisfies RouteCardData;
  });

  return {
    cards,
    guideCount: guideCount ?? 0,
    mapped: cards.map((c) => ({
      slug: c.slug,
      name: c.name,
      region: c.region,
      days: c.typical_days,
      maxAltitudeM: c.max_altitude_m,
    })),
    search: new URL(request.url).search,
    canonical: absoluteUrl(env.SITE_URL, "/routes"),
  };
}

export default function RoutesIndex({ loaderData }: Route.ComponentProps) {
  const { cards, mapped, guideCount, search } = loaderData as any;
  // In the URL rather than in useState: a page filtered to Langtang was not a
  // link you could send anybody, and a reload threw it away.
  const params = new URLSearchParams(search);
  const facets = {
    region: params.get("region") || "all",
    grade: params.get("grade") || "all",
    length: params.get("length") || "all",
    month: params.get("month") || "all",
  };
  const [sort, setSort] = useState<SortKey>("altitude");

  const regions = useMemo(() => regionsOf(cards), [cards]);
  const lengths = useMemo(() => lengthsOf(cards), [cards]);
  const months = useMemo(() => monthsOf(cards), [cards]);
  const routeGroups = useMemo(
    () => [
      {
        param: "region",
        title: "Where in Nepal",
        type: "one" as const,
        anyLabel: "Anywhere",
        showFirst: 8,
        options: regions.map((r: any) => ({
          value: r.region,
          label: r.region,
          count: r.count,
        })),
      },
      {
        param: "length",
        title: "How long you have got",
        type: "one" as const,
        anyLabel: "Any length",
        options: lengths.map((l: any) => ({
          value: l.value,
          label: l.label,
          count: l.count,
        })),
      },
      {
        param: "grade",
        title: "How hard",
        type: "one" as const,
        anyLabel: "Any grade",
        // Capitalised for the panel; the values stay as the data has them.
        options: GRADES.map((g) => ({
          value: g,
          label: g.charAt(0).toUpperCase() + g.slice(1),
        })),
      },
      {
        param: "month",
        title: "When you are coming",
        type: "one" as const,
        anyLabel: "Any month",
        showFirst: 6,
        // Only the months something is walked in. Three routes in July is
        // the honest answer about the monsoon, and the one a reader
        // booking for July most needs.
        options: months.map((m: any) => ({
          value: String(m.month),
          label: m.label,
          count: m.count,
        })),
      },
    ],
    [regions, lengths, months],
  );
  const list = useMemo(
    () => sortCards(cards.filter((c: any) => matches(c, facets)), sort),
    [cards, facets.region, facets.grade, facets.length, facets.month, sort],
  );

  return (
    <main className="bg-paper">
      {/* ── The way in ─────────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 lg:grid-cols-[0.92fr_1.08fr] lg:py-16">
        <div>
          <h1 className="mt-3 font-display text-display-l text-ink sm:text-display-xl">
            {cards.length} routes.
            <br />
            Every metre accounted for.
          </h1>
          <p className="mt-5 max-w-[44ch] text-body-l text-muted">
            Real difficulty, live permit costs, and the named guides who lead them.
            Pick the mountain — then pick the human. No agency in the middle.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-5">
            <Link
              to="/match"
              className="inline-flex h-12 items-center gap-2 rounded-button bg-chartreuse px-5 font-medium text-pine shadow-card transition duration-instant hover:brightness-[0.97] active:scale-[0.97]"
            >
              <Glyph name="spark" /> Match me to a route
            </Link>
            <a
              href="#all-routes"
              className="border-b-2 border-line pb-0.5 font-medium text-ink transition duration-quick hover:border-moss hover:text-moss"
            >
              Browse all {cards.length}
            </a>
          </div>
          <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
            {[
              [guideCount, "verified guides"],
              [cards.length, "routes, day by day"],
              [0, "agencies in between"],
            ].map(([n, label]) => (
              <div key={label as string}>
                <dd className="font-display text-display-m text-ink">{n as number}</dd>
                <dt className="mt-0.5 text-caption text-muted">{label as string}</dt>
              </div>
            ))}
          </dl>
        </div>

        {/* The country itself, tilted. Twenty-four walks in real places. */}
        <figure className="m-0 overflow-hidden rounded-card border border-line bg-card">
          <NepalRouteMap routes={mapped} />
          <figcaption className="border-t border-line bg-mist/50 px-4 py-3 text-caption text-muted">
            Every line is a route we run. Tap one to find it in the list below.
          </figcaption>
        </figure>
      </section>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      {/* Sticky, so it has to stay short. Fourteen regions wrapped onto five
          rows took a whole 360px screen and pinned it there; on a phone each
          row scrolls sideways instead, and the sort collapses to a select. */}
      <div className="sticky top-0 z-30 border-y border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            {/* Fourteen regions and four grades used to be two scrolling rows
                pinned to the top of a 360px screen. One panel, and the bar
                gets its height back. */}
            <div className="min-w-0">
              <FilterSheet
                groups={routeGroups}
                params={params}
                resultCount={list.length}
                action="/routes"
                keep={[]}
              />
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden font-mono text-caption text-muted sm:inline">
                {list.length} {list.length === 1 ? "route" : "routes"}
              </span>
              <div className="hidden gap-0.5 rounded-pill border border-line bg-card p-1 md:flex">
                {SORTS.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSort(key)}
                    aria-pressed={sort === key}
                    className={`rounded-pill px-3 py-1.5 text-caption transition duration-quick ${
                      sort === key ? "bg-ink text-paper" : "text-muted hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="md:hidden">
                <span className="sr-only">Sort the routes</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="rounded-pill border border-line bg-card px-3 py-1.5 text-caption text-ink"
                >
                  {SORTS.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* ── The routes ─────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-6xl px-4 py-10" id="all-routes">
        {/* One grid. The count above it is the count in the bar, because
            there is now only one list for either of them to be counting. */}
        <h2 className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line pb-2.5 font-display text-2xl text-ink">
          {resultHeading(list.length, cards.length)}
          {list.length < cards.length && (
            <Link
              to="/routes"
              className="font-sans text-caption font-normal text-muted underline-offset-4 hover:text-moss hover:underline"
            >
              Show all {cards.length} →
            </Link>
          )}
        </h2>

        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r: any, i: number) => (
            // The first row is above the fold on every width, so it does not
            // wait for the observer before it starts fetching.
            <RouteCard key={r.slug} route={r} eager={i < 3} />
          ))}
        </div>

        {list.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-muted">Nothing matches all of that — yet.</p>
            <Link
              to="/routes"
              className="mt-4 inline-block rounded-pill border border-line bg-card px-4 py-2 text-sm font-medium text-ink hover:border-moss hover:text-moss"
            >
              Clear the filters
            </Link>
          </div>
        )}

        <div className="mt-12 flex flex-wrap items-center justify-between gap-5 rounded-card border border-line bg-mist/50 p-6">
          <div>
            <h3 className="font-display text-display-m text-ink">Not sure which route?</h3>
            <p className="mt-1.5 text-muted">
              Answer five questions and we'll match you with the guides — and the routes — that fit.
            </p>
          </div>
          <Link
            to="/match"
            className="rounded-pill bg-ink px-5 py-3 font-medium text-paper transition duration-quick hover:bg-pine"
          >
            Start the match
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4">
        <BookingAssurance className="mt-16" />
      </div>
    </main>
  );
}


