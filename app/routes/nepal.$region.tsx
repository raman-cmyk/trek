import { Link, data } from "react-router";
import type { Route } from "./+types/nepal.$region";
import { absoluteUrl, breadcrumbLd, jsonLd, pageMeta } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { GuideCard, OfferingCard } from "~/components/public/cards";
import { BookingAssurance } from "~/components/public/BookingAssurance";
export { publicCacheHeaders as headers } from "~/lib/cache-headers";
import { inRegion, regionBySlug, TREK_REGIONS } from "~/lib/trek-regions";
import { guideRatings } from "~/lib/ratings.server";
import { BRAND } from "~/lib/brand";

/**
 * Trekking in one region, as a page search can find.
 *
 * "Trekking in Annapurna" and "things to do in Mustang" are among the highest
 * intent things a person types before booking a trek, and this site had no
 * page for either — a region was a query string on /routes, which search
 * treats as one page with ten sets of contents.
 *
 * So: one indexable page per region, at /nepal/<region>, carrying the three
 * things somebody at that stage wants — the trails, the people who lead them,
 * and the trips you can actually book. Nothing on it is written by hand
 * except the region's own sentence; the rest is the real roster, so the page
 * cannot go stale or over-claim.
 */
export function meta({ loaderData: d }: Route.MetaArgs) {
  if (!d) return [{ title: "Region not found" }];
  const { region, routeCount, guideCount, canonical, origin } = d as any;
  return [
    ...pageMeta({
      title: `Trekking in ${region.name}, Nepal — ${guideCount} verified guides`,
      description: `${region.blurb} ${routeCount} routes, day by day, and the ${guideCount} licensed guides who lead them. You pick the guide, not an agency.`,
      canonical,
      type: "website",
    }),
    jsonLd({
      "@context": "https://schema.org",
      "@type": "TouristDestination",
      name: `${region.name}, Nepal`,
      description: region.blurb,
      url: canonical,
      touristType: region.intent,
      containedInPlace: { "@type": "Country", name: "Nepal" },
    }),
    jsonLd(
      breadcrumbLd([
        { name: "Routes", url: `${origin}/routes` },
        { name: region.name, url: canonical },
      ]),
    ),
  ];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const region = regionBySlug(String(params.region));
  if (!region) throw new Response("Not found", { status: 404 });

  const client = createPublicClient(env);
  const [{ data: routes }, { data: offerings }, { data: guides }] = await Promise.all([
    client
      .from("routes")
      .select("id, slug, name, region, typical_days, max_altitude_m, difficulty, summary")
      .eq("status", "live")
      .order("typical_days", { ascending: false }),
    client
      .from("public_offerings")
      .select(
        "id, slug, kind, title, summary, days, price_usd_cents, price_breakdown, max_party, min_party, cover_photo_url, guide_id, guide_slug, guide_name, guide_avatar_url, guide_tier, guide_day_rate_usd_cents, guide_years_experience, route_id, route_slug, route_name",
      ),
    client
      .from("public_guides")
      .select(
        "user_id, slug, full_name, avatar_url, home_district, regions, tier, hook_line, only_with_me, day_rate_usd_cents, median_response_mins, years_experience, treks_completed_platform",
      )
      .order("user_id"),
  ]);

  // The trails in this region, and the trips on those trails.
  const mine = (routes ?? []).filter((r: any) => inRegion(region, r.region));
  const ids = new Set(mine.map((r: any) => r.id));
  const trips = (offerings ?? []).filter((o: any) => o.route_id && ids.has(o.route_id));

  // Who leads here: anyone selling a trip on one of these trails, plus anyone
  // whose own stated regions cover it. The second half matters — a guide new
  // to the platform has listed where they work before they have listed a trip.
  const selling = new Set(trips.map((o: any) => o.guide_id));
  const names = region.values.map((v) => v.toLowerCase());
  const theirs = (guides ?? []).filter((g: any) => {
    if (selling.has(g.user_id)) return true;
    const rs = ((g.regions ?? []) as string[]).map((r) => r.trim().toLowerCase());
    return rs.some((r) => names.includes(r));
  });

  const ratings = await guideRatings(client, theirs.map((g: any) => g.user_id));

  return data(
    {
      region,
      origin: new URL(request.url).origin,
      canonical: absoluteUrl(env.SITE_URL, `/nepal/${region.slug}`),
      routes: mine,
      trips: trips.slice(0, 8),
      guides: theirs.slice(0, 8),
      ratings,
      routeCount: mine.length,
      guideCount: theirs.length,
    },
  );
}

export default function RegionPage({ loaderData }: Route.ComponentProps) {
  const { region, routes, trips, guides, ratings, routeCount, guideCount } =
    loaderData as any;

  return (
    <main className="pb-16">
      <header className="mx-auto max-w-6xl px-4 pt-12">
        <p className="label text-muted">{region.intent}</p>
        <h1 className="mt-2 max-w-[22ch] font-display text-3xl leading-[1.05] text-ink sm:text-5xl">
          Trekking in {region.name}
        </h1>
        <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-ink-soft">
          {region.blurb}
        </p>
        <p className="mt-4 font-mono text-caption text-muted">
          {routeCount} {routeCount === 1 ? "route" : "routes"} ·{" "}
          {guideCount} {guideCount === 1 ? "guide" : "guides"} who work here
        </p>
      </header>

      {/* The people first. On this site the guide is the thing being chosen,
          and a region page that opens with a list of trails is every other
          trekking site. */}
      {guides.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-14">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="font-display text-2xl text-ink sm:text-3xl">
              Guides who walk {region.name}
            </h2>
            <Link to="/guides" prefetch="intent" className="text-sm font-medium text-moss hover:underline">
              Every guide →
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {guides.map((g: any) => (
              <GuideCard key={g.user_id} guide={g} rating={ratings[g.user_id]} />
            ))}
          </div>
        </section>
      )}

      {trips.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-16">
          <h2 className="font-display text-2xl text-ink sm:text-3xl">
            Trips you can book here
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {trips.map((o: any) => (
              <OfferingCard key={o.id} offering={o} rating={ratings[o.guide_id]} />
            ))}
          </div>
        </section>
      )}

      {routes.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-16">
          <h2 className="font-display text-2xl text-ink sm:text-3xl">
            The trails, day by day
          </h2>
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {routes.map((r: any) => (
              <li key={r.id}>
                <Link
                  to={`/routes/${r.slug}`}
                  prefetch="intent"
                  className="group flex flex-wrap items-baseline gap-x-4 gap-y-1 py-4"
                >
                  <span className="font-display text-lg text-ink group-hover:text-moss">
                    {r.name}
                  </span>
                  <span className="font-mono text-caption text-muted">
                    {[
                      r.typical_days ? `${r.typical_days} days` : null,
                      r.max_altitude_m ? `${r.max_altitude_m.toLocaleString("en-US")} m` : null,
                      r.difficulty,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {r.summary && (
                    <span className="w-full max-w-[70ch] text-sm text-muted">{r.summary}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Nowhere else to go from an empty region but somewhere real. */}
      {guides.length === 0 && trips.length === 0 && routes.length === 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-14">
          <p className="max-w-[54ch] text-muted">
            Nobody on {BRAND} leads in {region.name} yet. Tell us where you want
            to walk and we will find the guide who knows it.
          </p>
          <Link
            to="/match"
            className="mt-4 inline-block rounded bg-pine px-5 py-3 font-medium text-paper hover:bg-moss"
          >
            Tell us where →
          </Link>
        </section>
      )}

      <div className="mx-auto max-w-6xl px-4">
        <BookingAssurance className="mt-16" />
      </div>

      {/* Every other region, so one page leads to the next — and so all ten
          are reachable from any one of them. */}
      <section className="mx-auto max-w-6xl px-4 pt-16">
        <h2 className="font-display text-2xl text-ink">Other regions</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {TREK_REGIONS.filter((r) => r.slug !== region.slug).map((r) => (
            <li key={r.slug}>
              <Link
                to={`/nepal/${r.slug}`}
                prefetch="intent"
                className="inline-block rounded-pill border border-line px-3 py-1.5 text-sm text-ink hover:border-sage hover:bg-mist"
              >
                {r.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
