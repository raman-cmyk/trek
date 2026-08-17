import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/routes.$slug";
import {
  pageMeta,
  touristTripLd,
  faqLd,
  breadcrumbLd,
  jsonLd,
  absoluteUrl,
} from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { getRouteArticle } from "~/lib/content";
import { useMoney } from "~/lib/currency-context";
import { fmtMetres } from "~/lib/format";
import { SmartImage } from "~/components/SmartImage";
import { OfferingCard, type PublicOffering } from "~/components/public/cards";
import { JournalCard } from "~/components/public/JournalCard";
import { ElevationScrubber, type DayStop } from "~/components/public/ElevationScrubber";
import { RouteMap } from "~/components/public/RouteMap";
import { ExperienceSplit } from "~/components/Split";
import {
  partyAmounts,
  fromPerPersonUsdCents,
  type PriceBreakdown,
} from "~/lib/experience-pricing";
import { offeringsRating } from "~/lib/ratings.server";
import { JOURNAL_COLS, type PublicJournal } from "~/lib/journals";
import { cn } from "~/lib/cn";
import { CLIMB_ROUTES } from "~/lib/climb";
import { Rail } from "~/components/public/Rail";
import { ClimbRoute } from "~/components/public/ClimbRoute";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function meta({ loaderData: data }: Route.MetaArgs) {
  if (!data) return [{ title: "Route not found" }];
  const r = data.route as any;
  const origin = new URL(data.canonical).origin;
  const tags = [
    ...pageMeta({
      title: `${r.name} trek — ${r.typical_days} days, ${fmtMetres(r.max_altitude_m)}`,
      description:
        r.summary ??
        `Day-by-day itinerary, permits, real costs and every verified guide who runs the ${r.name} trek in Nepal.`,
      canonical: data.canonical,
      image: r.hero_photo_url ?? undefined,
      type: "article",
    }),
    jsonLd(
      touristTripLd({
        name: `${r.name} Trek`,
        url: data.canonical,
        description: r.summary ?? r.name,
        image: r.hero_photo_url,
        days: r.typical_days,
        maxAltitudeM: r.max_altitude_m,
        region: r.region,
        fromUsdCents: data.fromUsdCents,
        rating: data.rating,
        stops: (r.day_stops ?? []).map((s: any) => ({
          day: s.day,
          place: s.place,
          altitude_m: s.altitude_m,
        })),
        // A named human runs this trip, not an agency — the guide who has
        // written this route up most is the one the graph names.
        provider: data.guides?.[0]
          ? { name: data.guides[0].name, url: `${origin}/guides/${data.guides[0].slug}` }
          : null,
        origin,
      }),
    ),
    jsonLd(
      breadcrumbLd([
        { name: "Routes", url: origin + "/routes" },
        { name: r.name, url: data.canonical },
      ]),
    ),
  ];
  // The route's own FAQ and the hand-written article's can ask the same thing
  // ("do I need a guide?"). A FAQPage with the same question twice is a
  // structured-data error, so first one wins.
  const seen = new Set<string>();
  const faq = [...(r.faq ?? []), ...(data.article?.faq ?? [])].filter((f: any) => {
    const k = String(f.q ?? "").trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (faq.length) tags.push(jsonLd(faqLd(faq)));
  return tags;
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);

  const { data: route } = await client
    .from("routes")
    .select(
      "id, slug, name, region, typical_days, max_altitude_m, difficulty, season_months, distance_km, summary, start_point, end_point, hero_photo_url, day_stops, month_profile, faq, status, created_by_guide_id, guide:guides!routes_created_by_guide_id_fkey(slug, users(full_name))",
    )
    .eq("slug", params.slug)
    .maybeSingle();
  if (!route) throw new Response("Route not found", { status: 404 });

  const [{ data: permits }, { data: offerings }, { data: journals }] = await Promise.all([
    client
      .from("permits")
      .select("name, cost_usd_cents, cost_npr_paisa, issuing_body, lead_time_days")
      .eq("route_id", route.id),
    client
      .from("public_offerings")
      .select(
        "id, slug, kind, title, summary, days, price_usd_cents, price_breakdown, max_party, cover_photo_url, guide_id, guide_slug, guide_name, guide_avatar_url, guide_tier, guide_day_rate_usd_cents",
      )
      .eq("route_id", route.id),
    // The freshness engine: every journal written on this route.
    client
      .from("public_journals")
      .select(JOURNAL_COLS)
      .eq("route_id", route.id)
      .order("start_date", { ascending: false })
      .limit(9),
  ]);

  // Guides who run it, with how many times they have written it up.
  const counts = new Map<string, number>();
  for (const j of (journals ?? []) as PublicJournal[]) {
    counts.set(j.guide_id, (counts.get(j.guide_id) ?? 0) + 1);
  }
  const seen = new Set<string>();
  const guides = ((offerings ?? []) as any[])
    .filter((o) => {
      if (seen.has(o.guide_slug)) return false;
      seen.add(o.guide_slug);
      return true;
    })
    .map((o) => ({
      slug: o.guide_slug,
      name: o.guide_name,
      avatar: o.guide_avatar_url,
      tier: o.guide_tier,
      treks: counts.get(o.guide_id) ?? 0,
    }))
    .sort((a, b) => b.treks - a.treks);

  // Nobody reviews a route, they review a guide's version of it — so the
  // route's rating is every review left on the offerings that run it. Without
  // this the route page is the only page type with no rating in its graph.
  const rating = await offeringsRating(
    client,
    ((offerings ?? []) as any[]).map((o) => o.id),
  );
  const fromUsdCents = ((offerings ?? []) as PublicOffering[])
    .map((o) =>
      o.price_breakdown
        ? fromPerPersonUsdCents(o.price_breakdown as PriceBreakdown, o.max_party)
        : null,
    )
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b)[0] ?? null;

  const article = getRouteArticle(params.slug);
  let related: Array<{ slug: string; name: string; region: string; typical_days: number }> = [];
  const { data: rel } = await client
    .from("routes")
    .select("slug, name, region, typical_days")
    .eq("region", route.region)
    .neq("slug", route.slug)
    .limit(4);
  related = rel ?? [];

  return {
    route,
    permits: permits ?? [],
    offerings: (offerings ?? []) as PublicOffering[],
    journals: (journals ?? []) as PublicJournal[],
    guides,
    article,
    related,
    rating,
    fromUsdCents,
    canonical: absoluteUrl(env.SITE_URL, `/routes/${params.slug}`),
  };
}

export default function RoutePage({ loaderData }: Route.ComponentProps) {
  // Langtang gets the page that climbs (see ClimbRoute). Other routes keep
  // the standard layout until this one is genuinely great — rolling it out
  // is configuration in CLIMB_ROUTES, not a rewrite. Dispatched from a
  // wrapper so neither branch calls the other's hooks.
  const d = loaderData as any;
  const climb = CLIMB_ROUTES[d.route.slug];
  if (climb) {
    return (
      <ClimbRoute
        cfg={climb}
        route={d.route}
        permits={d.permits}
        offerings={d.offerings}
        journals={d.journals}
        guides={d.guides}
      />
    );
  }
  return <StandardRoutePage loaderData={loaderData} />;
}

function StandardRoutePage({ loaderData }: { loaderData: unknown }) {
  const { route, permits, offerings, journals, guides, article, related } = loaderData as any;
  const { m } = useMoney();
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const stops = (route.day_stops ?? []) as DayStop[];
  const months = (route.month_profile ?? []) as {
    m: number; crowds: number; weather: number; cost: number; note: string;
  }[];
  const bestMonths = (route.season_months ?? []) as number[];

  // The Split uses a real listing on this route, not a made-up number.
  const priced = (offerings as PublicOffering[]).find((o) => o.price_breakdown);
  const split = priced?.price_breakdown
    ? partyAmounts(priced.price_breakdown as PriceBreakdown, 2)
    : null;

  return (
    <main className="pb-16">
      {/* Hero */}
      <div className="relative">
        <SmartImage
          src={route.hero_photo_url ?? "/img/hero.jpg"}
          alt={`${route.name} trek`}
          width={1800}
          height={900}
          eager
          cover
          className="h-[42vh] w-full sm:h-[56vh]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/15" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-5xl px-4 pb-6">
            <p className="label text-white/70">{route.region}</p>
            <h1 className="mt-1 max-w-[18ch] font-display text-4xl leading-[1.05] text-white sm:text-6xl">
              {route.name}
            </h1>
            {/* Somebody who has walked a route often enough to write it up is
                exactly the person a reader wants to hear it from, so the guide
                who proposed it is named on it. */}
            {(route as any).guide?.users?.full_name && (
              <p className="mt-2 text-sm text-white/85">
                Added by{" "}
                <Link
                  to={`/guides/${(route as any).guide.slug}`}
                  prefetch="intent"
                  className="underline underline-offset-4"
                >
                  {(route as any).guide.users.full_name.split(" ")[0]}
                </Link>
                , who walks it
              </p>
            )}
            <p className="mt-3 font-mono text-caption text-white/85 sm:text-sm">
              {route.typical_days} days · {fmtMetres(route.max_altitude_m)}
              {route.distance_km ? ` · ${route.distance_km} km` : ""} · {route.difficulty}
              {bestMonths.length ? ` · best ${bestMonths.map((n) => MONTHS[n - 1]).join(", ")}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4">
        {route.summary && (
          <p className="mt-8 max-w-[62ch] text-body-l text-ink">{route.summary}</p>
        )}
        {(route.start_point || route.end_point) && (
          <p className="mt-2 font-mono text-caption text-muted">
            {route.start_point} → {route.end_point}
          </p>
        )}

        {/* Elevation + map, wired together. */}
        {stops.length >= 2 && (
          <section className="mt-10">
            <h2 className="font-display text-2xl text-ink">The shape of it</h2>
            <div className="mt-3 rounded-md border border-line bg-card p-3 sm:p-4">
              <ElevationScrubber stops={stops} activeDay={activeDay} onDayChange={setActiveDay} />
            </div>
            <div className="mt-4">
              <RouteMap stops={stops} activeDay={activeDay} />
            </div>
          </section>
        )}

        {/* Day by day */}
        {stops.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-2xl text-ink">Day by day</h2>
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-md border border-line bg-card">
              {stops.map((s) => (
                <li key={s.day}>
                  <details
                    className="group"
                    onToggle={(e) =>
                      setActiveDay((e.currentTarget as HTMLDetailsElement).open ? s.day : null)
                    }
                  >
                    <summary className="flex cursor-pointer items-baseline gap-3 px-4 py-3 hover:bg-mist">
                      <span className="w-10 shrink-0 font-mono text-sm text-muted">
                        {s.day}
                      </span>
                      <span className="flex-1 font-medium text-ink">{s.place}</span>
                      <span className="shrink-0 font-mono text-caption text-muted">
                        {s.altitude_m.toLocaleString("en-US")} m
                      </span>
                    </summary>
                    {s.note && (
                      <p className="px-4 pb-3 pl-[4.25rem] text-sm text-ink-soft">{s.note}</p>
                    )}
                  </details>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Permits — exact, at cost */}
        {permits.length > 0 && (
          <section id="permits-costs" className="mt-12">
            <h2 className="font-display text-2xl text-ink">Permits for this route</h2>
            <div className="mt-3 overflow-x-auto rounded-md border border-line">
              <table className="w-full text-sm">
                <thead className="bg-card text-left text-xs uppercase text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Permit</th>
                    <th className="px-3 py-2 font-medium">Issued by</th>
                    <th className="px-3 py-2 font-medium">Lead time</th>
                    <th className="px-3 py-2 text-right font-medium">Cost (pp)</th>
                  </tr>
                </thead>
                <tbody>
                  {permits.map((p: any, i: number) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-3 py-2 text-ink">{p.name}</td>
                      <td className="px-3 py-2 text-muted">{p.issuing_body}</td>
                      <td className="px-3 py-2 font-mono text-muted">{p.lead_time_days}d</td>
                      <td className="px-3 py-2 text-right font-mono text-ink">
                        {m(p.cost_usd_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-caption text-muted">
              What we are charged is what you are charged. Permits appear at cost in
              your price breakdown.
            </p>
          </section>
        )}

        {/* What it costs, split */}
        {split && priced && (
          <section className="mt-12">
            <h2 className="font-display text-2xl text-ink">What it costs</h2>
            <p className="mt-1 text-sm text-muted">
              Real numbers from{" "}
              <Link to={`/treks/${priced.slug}`} className="text-moss hover:underline">
                {priced.title}
              </Link>
              , two people sharing.
            </p>
            <div className="mt-4 rounded-md border border-line bg-card p-5">
              <ExperienceSplit
                amounts={{
                  guide: split.guideUsdCents,
                  permits: split.permitsUsdCents,
                  porters: split.portersUsdCents,
                  logistics: split.logisticsUsdCents,
                  trek: split.trekUsdCents,
                  fund: split.fundUsdCents,
                }}
                total={split.totalUsdCents}
                showAmounts
              />
            </div>
          </section>
        )}

        {/* Twelve-month heatmap */}
        {months.length === 12 && (
          <section className="mt-12">
            <h2 className="font-display text-2xl text-ink">When to walk it</h2>
            <p className="mt-1 max-w-[58ch] text-sm text-muted">
              Best weather and worst crowds are usually the same month. This is the
              honest version, not the brochure one.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr>
                    <th className="py-1 pr-2 text-left text-xs font-medium uppercase text-muted">
                      &nbsp;
                    </th>
                    {months.map((mm) => (
                      <th
                        key={mm.m}
                        className="px-0.5 py-1 text-center font-mono text-[11px] font-normal text-muted"
                      >
                        {MONTHS[mm.m - 1]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Weather", "weather", true],
                      ["Crowds", "crowds", false],
                      ["Cost", "cost", false],
                    ] as const
                  ).map(([label, key, goodIsHigh]) => (
                    <tr key={key}>
                      <td className="py-1 pr-2 text-caption text-muted">{label}</td>
                      {months.map((mm) => {
                        const v = mm[key] as number;
                        // Weather high = good (green). Crowds/cost high = bad (wheat).
                        const good = goodIsHigh ? v : 6 - v;
                        return (
                          <td key={mm.m} className="px-0.5 py-1">
                            <span
                              title={`${label} ${v}/5 — ${mm.note}`}
                              className={cn(
                                "block h-6 rounded-sm",
                                good >= 5 && "bg-moss",
                                good === 4 && "bg-fern",
                                good === 3 && "bg-sage",
                                good === 2 && "bg-wheat",
                                good <= 1 && "bg-line",
                              )}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Guides who run it */}
        {guides.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display text-2xl text-ink">
              Guides who run {route.name}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {guides.map((g: any) => (
                <li key={g.slug}>
                  <Link
                    to={`/guides/${g.slug}`}
                    prefetch="intent"
                    className="flex items-center gap-2 rounded-pill border border-line bg-card py-1 pl-1 pr-3 text-sm hover:border-sage"
                  >
                    <SmartImage
                      src={g.avatar ?? ""}
                      alt=""
                      width={32}
                      height={32}
                      className="h-7 w-7 rounded-full"
                    />
                    <span className="font-medium text-ink">{g.name}</span>
                    {g.treks > 0 && (
                      <span className="font-mono text-caption text-muted">×{g.treks}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Journals — the freshness engine */}
        {journals.length > 0 && (
          <section className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 className="font-display text-2xl text-ink">
                {route.name}, as it actually went
              </h2>
              <Link
                to={`/journals?route=${route.slug}`}
                prefetch="intent"
                className="text-sm font-medium text-moss hover:underline"
              >
                All journals on this route →
              </Link>
            </div>
            <div className="mt-4">
              <Rail itemClassName="w-[80vw] max-w-[320px] sm:w-[300px]">
                {journals.slice(0, 6).map((j: PublicJournal) => (
                  <JournalCard key={j.id} journal={j} showGuide />
                ))}
              </Rail>
            </div>
          </section>
        )}

        {/* Bookable */}
        {offerings.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-4 font-display text-2xl text-ink">Book this route</h2>
            <Rail>
              {offerings.map((o: PublicOffering) => (
                <OfferingCard key={o.id} offering={o} />
              ))}
            </Rail>
          </section>
        )}

        {/* Long-form article, when one exists */}
        {article && (
          <article
            className="prose-trek mt-12 space-y-4 text-ink [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-2xl [&_h3]:mt-4 [&_h3]:font-medium [&_p]:leading-relaxed"
            dangerouslySetInnerHTML={{ __html: article.html }}
          />
        )}

        {/* FAQ (visible; JSON-LD in meta) */}
        {(route.faq?.length ?? 0) > 0 && (
          <section className="mt-12">
            <h2 className="mb-3 font-display text-2xl text-ink">Common questions</h2>
            <div className="space-y-2">
              {route.faq.map((f: any, i: number) => (
                <details key={i} className="rounded-md border border-line bg-card p-4">
                  <summary className="cursor-pointer font-medium text-ink">{f.q}</summary>
                  <p className="mt-2 max-w-[62ch] text-sm text-ink-soft">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-3 font-display text-2xl text-ink">Also in {route.region}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {related.map((r: any) => (
                <Link
                  key={r.slug}
                  to={`/routes/${r.slug}`}
                  prefetch="intent"
                  className="rounded-md border border-line bg-card p-4 hover:border-sage"
                >
                  <p className="font-medium text-ink">{r.name}</p>
                  <p className="mt-0.5 font-mono text-caption text-muted">
                    {r.typical_days} days
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
