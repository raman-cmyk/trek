import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/routes._index";
import { pageMeta, breadcrumbLd, jsonLd, absoluteUrl } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { getRouteArticle } from "~/lib/content";
import { NepalRouteMap } from "~/components/public/NepalRouteMap";
import { RouteCard, type RouteCardData } from "~/components/public/RouteCard";
import {
  GRADES,
  matches,
  priceSpread,
  profileOf,
  regionsOf,
  seasonLabel,
  sortCards,
  SORTS,
  type SortKey,
} from "~/lib/route-cards";

export { publicCacheHeaders as headers } from "~/lib/cache-headers";

/**
 * Every route we run, organised by altitude.
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

export async function loader({ context }: Route.LoaderArgs) {
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
        "route_id, guide_id, guide_slug, guide_name, guide_avatar_url, cover_photo_url, price_usd_cents, price_breakdown, max_party",
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
      photo,
      profile: profileOf(r.day_stops),
      lo: spread.lo,
      hi: spread.hi,
      guides: spread.guides,
      faces,
    } satisfies RouteCardData;
  });

  // The faces for the closing band: real guides, whoever has a photo.
  const { data: bandGuides } = await client
    .from("public_guides")
    .select("slug, full_name, avatar_url")
    .not("avatar_url", "is", null)
    // Enough to fill the band rather than leave one row of faces floating on
    // a field of green. All forty-nine have a photograph.
    .limit(54);

  return {
    cards,
    guideCount: guideCount ?? 0,
    band: (bandGuides ?? []).map((g: any) => ({
      slug: g.slug,
      name: g.full_name,
      avatar: g.avatar_url,
    })),
    mapped: cards.map((c) => ({
      slug: c.slug,
      name: c.name,
      region: c.region,
      days: c.typical_days,
      maxAltitudeM: c.max_altitude_m,
    })),
    canonical: absoluteUrl(env.SITE_URL, "/routes"),
  };
}

export default function RoutesIndex({ loaderData }: Route.ComponentProps) {
  const { cards, mapped, guideCount, band } = loaderData as any;
  const [region, setRegion] = useState("all");
  const [grade, setGrade] = useState("all");
  const [sort, setSort] = useState<SortKey>("altitude");

  const regions = useMemo(() => regionsOf(cards), [cards]);
  const list = useMemo(
    () => sortCards(cards.filter((c: any) => matches(c, region, grade)), sort),
    [cards, region, grade, sort],
  );

  // "Start here" only makes sense when nothing is filtered — once you have
  // asked for Langtang, three other routes above the answer are noise.
  const untouched = region === "all" && grade === "all";
  const featured = untouched
    ? [...cards].sort((a: any, b: any) => b.guides - a.guides).slice(0, 3)
    : [];
  const featuredSlugs = new Set(featured.map((f: any) => f.slug));
  const rest = untouched ? list.filter((c: any) => !featuredSlugs.has(c.slug)) : list;

  return (
    <main className="bg-paper">
      {/* ── The way in ─────────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 lg:grid-cols-[0.92fr_1.08fr] lg:py-16">
        <div>
          <p className="label text-muted">Routes</p>
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
              className="rounded-pill bg-ink px-5 py-3 font-medium text-paper transition duration-quick hover:bg-pine"
            >
              Match me to a route
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
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            <Pill on={region === "all"} onClick={() => setRegion("all")}>
              All regions
            </Pill>
            {regions.map((r: any) => (
              <Pill key={r.region} on={region === r.region} onClick={() => setRegion(r.region)}>
                {r.region} <span className="font-mono opacity-60">{r.count}</span>
              </Pill>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            {/* No bleed to the screen edge here: the sort control sits at the
                end of this row, and a word half-under it reads as a bug. */}
            <div className="no-scrollbar flex min-w-0 gap-1 overflow-x-auto pr-2 sm:flex-wrap sm:pr-0">
              <Ghost on={grade === "all"} onClick={() => setGrade("all")}>
                All grades
              </Ghost>
              {GRADES.map((g) => (
                <Ghost key={g} on={grade === g} onClick={() => setGrade(g)}>
                  <span className="capitalize">{g}</span>
                </Ghost>
              ))}
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden font-mono text-caption text-muted sm:inline">
                {list.length} routes
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
        {featured.length > 0 && (
          <>
            <h2 className="label border-b border-line pb-2.5 text-muted">Start here</h2>
            <div className="mt-5 grid gap-5 lg:grid-cols-3">
              {featured.map((r: any, i: number) => (
                <RouteCard key={r.slug} route={r} featured eager={i === 0} />
              ))}
            </div>
            <h2 className="label mt-12 border-b border-line pb-2.5 text-muted">Every route</h2>
          </>
        )}

        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((r: any) => (
            <RouteCard key={r.slug} route={r} />
          ))}
        </div>

        {list.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-muted">
              Nothing at that grade in {region === "all" ? "Nepal" : region} — yet.
            </p>
            <button
              type="button"
              onClick={() => {
                setRegion("all");
                setGrade("all");
              }}
              className="mt-4 rounded-pill border border-line bg-card px-4 py-2 text-sm font-medium text-ink hover:border-moss hover:text-moss"
            >
              Clear the filters
            </button>
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

      {/* ── The people ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-pine">
        <div className="absolute inset-0 grid auto-rows-min grid-cols-6 opacity-40 sm:grid-cols-9 lg:grid-cols-[repeat(18,1fr)]">
          {band.map((g: any) => (
            <span key={g.slug} className="aspect-square overflow-hidden">
              <img
                src={g.avatar}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover grayscale"
              />
            </span>
          ))}
        </div>
        {/* Forty-nine faces never divide evenly into a row, so the last one is
            always short. The wash hides where the grid runs out. */}
        <div className="absolute inset-0 bg-gradient-to-b from-pine/50 via-pine/80 to-pine" />
        <div className="relative mx-auto max-w-3xl px-4 py-20 text-center sm:py-24">
          <h2 className="font-display text-display-l text-paper">
            {guideCount} people. Pick one.
          </h2>
          <p className="mx-auto mt-3 max-w-[46ch] text-sage">
            Every face here is a licensed guide we have met in person. None of them is an agency.
          </p>
          <Link
            to="/guides"
            className="mt-7 inline-block rounded-pill bg-paper px-5 py-3 font-medium text-ink transition duration-quick hover:bg-mist"
          >
            Browse the guides
          </Link>
        </div>
      </section>
    </main>
  );
}

function Pill({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`shrink-0 whitespace-nowrap rounded-pill border px-3.5 py-1.5 text-caption transition duration-quick ${
        on
          ? "border-pine bg-pine text-paper"
          : "border-line bg-card text-muted hover:border-sage hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Ghost({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`shrink-0 whitespace-nowrap rounded-pill px-3 py-1.5 text-caption transition duration-quick ${
        on ? "bg-ink text-paper" : "text-muted hover:bg-mist hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
