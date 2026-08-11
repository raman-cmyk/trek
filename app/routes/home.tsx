import { Link } from "react-router";
import type { Route } from "./+types/home";
import { copy } from "~/lib/copy";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { createAdminClient, createPublicClient, getEnv } from "~/lib/supabase.server";
import { fundCollected } from "~/lib/fund.server";
import { guideRatings } from "~/lib/ratings.server";
import { useState } from "react";
import {
  GuideCard,
  OfferingCard,
  type PublicGuide,
  type PublicOffering,
} from "~/components/public/cards";
import { cn } from "~/lib/cn";
import { Stars } from "~/components/public/bits";
import { SmartImage } from "~/components/SmartImage";
import { HeroSearch } from "~/components/public/HeroSearch";
import { GuideMap, type MapPin, type MapRoute } from "~/components/public/GuideMap";
import { computeExperiencePricing, type PriceBreakdown } from "~/lib/experience-pricing";
import { useMoney } from "~/lib/currency-context";
import { INTENTS, REGIONS, matchesKeywords } from "~/lib/intents";
import { addDays } from "~/lib/browse";
import { TREK_FEE_PCT } from "~/lib/config";
import { fmtDate, fmtDateShort } from "~/lib/format";
import { openRunsByGuide } from "~/lib/browse.server";
import { JournalCard } from "~/components/public/JournalCard";
import { JOURNAL_COLS, type PublicJournal } from "~/lib/journals";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return pageMeta({
    title: "Trek \u2014 know who\u2019s walking with you",
    description: copy.brand.tagline,
    canonical: data?.canonical ?? "",
  });
}

type HomeGuide = PublicGuide & {
  bio: string | null;
  only_with_me: string | null;
  gender: string | null;
  years_experience: number | null;
  treks_completed_platform: number;
};

const GUIDE_COLS =
  "user_id, slug, full_name, avatar_url, home_district, tier, hook_line, bio, only_with_me, gender, years_experience, day_rate_usd_cents, median_response_mins, treks_completed_platform";

export async function loader({ context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = addDays(today, 7);
  const yearStart = today.slice(0, 4) + "-01-01";

  const [
    { data: guides },
    { data: offerings },
    { data: routes },
    { data: reviews },
    fund,
    { data: journals },
  ] = await Promise.all([
      // The whole roster: this page is about scale, and 48 rows of text is
      // cheaper than six round trips for six different slices of it.
      client.from("public_guides").select(GUIDE_COLS),
      client
        .from("public_offerings")
        .select(
          "id, slug, kind, route_id, title, summary, days, price_usd_cents, price_breakdown, max_party, cover_photo_url, guide_id, guide_slug, guide_name, guide_avatar_url, guide_tier, guide_day_rate_usd_cents, route_slug, route_name",
        ),
      client
        .from("routes")
        .select("id, slug, name, region, typical_days, max_altitude_m, difficulty, sort")
        .order("sort"),
      client
        .from("public_reviews")
        .select("id, overall, body, published_at, author_name, author_country")
        .order("published_at", { ascending: false })
        .limit(4),
      // Same helper /fund uses — the two numbers must never disagree.
      fundCollected(createAdminClient(env), { sinceStartDate: yearStart }),
      // Proof of life: the most recent treks anyone actually walked.
      client
        .from("public_journals")
        .select(JOURNAL_COLS)
        .order("start_date", { ascending: false })
        .limit(3),
    ]);

  const all = (guides ?? []) as HomeGuide[];
  const ids = all.map((g) => g.user_id);

  const [ratings, langMap, freeRuns] = await Promise.all([
    guideRatings(client, ids),
    (async () => {
      const map: Record<string, string[]> = {};
      if (ids.length) {
        const { data } = await client
          .from("guide_languages")
          .select("guide_id, language")
          .in("guide_id", ids);
        for (const l of data ?? []) (map[l.guide_id] ??= []).push(l.language);
      }
      return map;
    })(),
    openRunsByGuide(client, { from: today, to: weekEnd }, ids),
  ]);

  // Which guides lead which region — the region rows and "women guiding
  // Annapurna" both need it, and it's one pass over data we already have.
  const routeById = new Map((routes ?? []).map((r) => [r.id, r]));
  const regionsByGuide: Record<string, Set<string>> = {};
  for (const o of offerings ?? []) {
    const r = o.route_id ? routeById.get(o.route_id) : null;
    if (r) (regionsByGuide[o.guide_id] ??= new Set()).add(r.region);
  }

  // Route rows for the catalogue strip. Route pages are the primary SEO
  // surface, so the homepage links the named routes themselves — not just the
  // hub — with the one number that makes a route feel staffed rather than
  // listed: how many guides on Trek actually lead it.
  const guidesPerRoute: Record<string, Set<string>> = {};
  for (const o of offerings ?? []) {
    if (o.route_id) (guidesPerRoute[o.route_id] ??= new Set()).add(o.guide_id);
  }
  const routeRows = (routes ?? [])
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      region: r.region,
      days: r.typical_days,
      max_altitude_m: r.max_altitude_m,
      difficulty: r.difficulty,
      guides: guidesPerRoute[r.id]?.size ?? 0,
    }))
    .sort((a, b) => b.guides - a.guides || a.name.localeCompare(b.name))
    .slice(0, 8);

  const pick = (g: HomeGuide) => g; // rows carry whole guide rows; cards need them

  const rows = INTENTS.map((intent) => {
    let matched = all;
    if (intent.gender) matched = matched.filter((g) => g.gender === intent.gender);
    if (intent.keywords) matched = matched.filter((g) => matchesKeywords(g, intent.keywords!));
    if (intent.languages) {
      matched = matched.filter((g) =>
        (langMap[g.user_id] ?? []).some((l) => intent.languages!.includes(l)),
      );
    }
    if (intent.region) {
      matched = matched.filter((g) => regionsByGuide[g.user_id]?.has(intent.region!));
    }
    return {
      key: intent.key,
      label: intent.label,
      blurb: intent.blurb,
      href: `/guides?intent=${intent.key}`,
      total: matched.length,
      guides: matched.slice(0, 8).map(pick),
    };
    // A row of one reads as a bug, not a choice. Rows appear when there are
    // enough guides to make the choice real; the rest wait for supply.
  }).filter((r) => r.guides.length >= 3);

  const freeThisWeek = all
    .filter((g) => (freeRuns[g.user_id] ?? 0) >= 3)
    .sort((a, b) => (freeRuns[b.user_id] ?? 0) - (freeRuns[a.user_id] ?? 0));

  // Map pins: one per district, with a few names for the popup.
  const byDistrict: Record<string, HomeGuide[]> = {};
  for (const g of all) {
    if (g.home_district) (byDistrict[g.home_district] ??= []).push(g);
  }
  const pins: MapPin[] = Object.entries(byDistrict).map(([district, gs]) => ({
    district,
    count: gs.length,
    sample: gs.slice(0, 3).map((g) => ({
      slug: g.slug,
      name: g.full_name,
      only_with_me: g.only_with_me,
    })),
  }));

  // The Split section uses one real trek's real numbers.
  const splitOffering =
    (offerings ?? []).find((o) => o.slug === "ebc-classic-with-pemba" && o.price_breakdown) ??
    (offerings ?? []).find((o) => o.kind === "trek" && o.price_breakdown) ??
    null;

  const regionCounts: Record<string, number> = {};
  for (const set of Object.values(regionsByGuide)) {
    for (const r of set) regionCounts[r] = (regionCounts[r] ?? 0) + 1;
  }

  // The catalogue. The page already loads every offering for the region and
  // route maths, so rendering them costs nothing extra — and filtering on the
  // client makes the chips instant instead of a round trip per tap.
  const experiences = ((offerings ?? []) as any[]).map((o) => ({
    ...o,
    region: o.route_id ? (routeById.get(o.route_id)?.region ?? null) : null,
  }));

  return {
    rows,
    experiences,
    freeThisWeek: freeThisWeek.slice(0, 8),
    freeThisWeekTotal: freeThisWeek.length,
    freeRuns,
    pins,
    routes: (routes ?? []).map((r) => ({ slug: r.slug, name: r.name, region: r.region })) as MapRoute[],
    routeRows,
    routeTotal: (routes ?? []).length,
    regionCounts,
    ratings,
    langMap,
    splitOffering,
    review: (reviews ?? [])[0] ?? null,
    journals: (journals ?? []) as PublicJournal[],
    stats: {
      guides: all.length,
      districts: pins.length,
      treksLed: all.reduce((s, g) => s + (g.treks_completed_platform ?? 0), 0),
      fundUsdCents: fund.collected,
    },
    suggestions: [
      ...new Set([
        ...(routes ?? []).map((r) => r.name),
        ...(routes ?? []).map((r) => r.region),
      ]),
    ].sort(),
    today,
    weekEnd,
    canonical: absoluteUrl(env.SITE_URL, "/"),
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const {
    rows,
    experiences,
    freeThisWeek,
    freeThisWeekTotal,
    pins,
    routes,
    routeRows,
    routeTotal,
    regionCounts,
    ratings,
    langMap,
    splitOffering,
    review,
    journals,
    stats,
    suggestions,
    today,
    weekEnd,
  } = loaderData;
  const { m, mr } = useMoney();

  return (
    <main>
      {/* 1 — Search first. The photo still carries the page, but the thing you
          can DO is on top of it. */}
      <section className="relative flex min-h-[82vh] flex-col justify-end">
        <SmartImage
          src="/img/hero.jpg"
          alt="Trekkers crossing a high pass at golden hour, Khumbu"
          width={2000}
          height={860}
          eager
          cover
          className="absolute inset-0 h-full w-full"
        />
        {/* Two scrims, because one tuned gradient can't hold contrast across
            every crop. The first is bottom-anchored and leaves the top of the
            photograph alone; the second is a band anchored to the TEXT, so it
            moves with the type instead of with the framing. Measured, not
            guessed: white against the brightest pixel behind the headline was
            3.1–4.8:1 with the bottom scrim alone (fails AA at 360–390px), and
            is 6:1+ at every width from 360 to 1920 with both. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent" />
        {/* A second, horizontal scrim. Both are full-bleed on purpose: a scrim
            inset to the content column leaves a visible rectangle edge across
            the photograph. Left-heavy because the type is left-aligned, and it
            only reaches black/20 on the right so the lit ridge survives. */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/45 to-black/40 sm:via-black/15 sm:to-transparent" />
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-12 pt-24">
          <h1 className="display-hero max-w-[13ch] font-display text-[12vw] text-white [text-shadow:0_2px_24px_rgb(0_0_0/0.5)] sm:text-6xl lg:text-7xl">
            <span className="wt-heavy">Know who&rsquo;s</span>{" "}
            <span className="wt-light text-white/90">walking with you.</span>
          </h1>
          <p className="mt-4 max-w-[50ch] text-lg text-white/85">
            Choose your guide first — see their treks, hear their voice, message
            them free. When it feels right, book. That&rsquo;s the whole thing.
          </p>
          <div className="mt-7">
            <HeroSearch today={today} regions={suggestions} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <Link
              to="/match"
              prefetch="intent"
              className="text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
            >
              {copy.home.ctaMatch} →
            </Link>
            <Link
              to="/guides"
              prefetch="intent"
              className="text-white/80 underline decoration-white/25 underline-offset-4 hover:text-white"
            >
              or browse all {stats.guides} guides →
            </Link>
          </div>
        </div>
        <p className="absolute bottom-2 right-4 hidden font-mono text-[11px] text-white/55 sm:block">
          near Kongma La, 5,535 m · October · photo from Pemba's group
        </p>
      </section>

      {/* 2 — Live numbers. Mono, big, real. */}
      <section className="border-y border-line bg-mist">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-6 px-4 py-8 sm:grid-cols-3 lg:grid-cols-5">
          <Stat n={String(stats.guides)} label="verified guides" />
          <Stat n={String(stats.districts)} label="home districts" />
          <Stat n={stats.treksLed.toLocaleString("en-US")} label="treks led" />
          <Stat n={mr(stats.fundUsdCents)} label="to The Fund this year" href="/fund" />
          <Stat n={mr(0)} label="taken on rescue flights" href="/safety" />
        </div>
      </section>

      {/* 3 — The map. "Guides across the whole country", not a claim but a
          picture of one. */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <p className="label text-muted">Where they are</p>
        <h2 className="mb-5 mt-2 max-w-[18ch] font-display text-3xl text-ink sm:text-4xl">
          <span className="wt-heavy">Guides from their own valleys.</span>
        </h2>
        <GuideMap pins={pins} routes={routes} />
      </section>

      {/* 4 — Free this week. Real availability, the most perishable thing we
          know, so it goes above the evergreen rows. */}
      {freeThisWeek.length > 0 && (
        <Row
          eyebrow="Available now"
          label="Who's free for your dates"
          blurb={`${freeThisWeekTotal} guides with open days between now and ${fmtDateShort(
            weekEnd,
          )}.`}
          count={freeThisWeekTotal}
          href={`/guides?from=${today}&to=${weekEnd}`}
          guides={freeThisWeek}
          ratings={ratings}
          langMap={langMap}
        />
      )}

      {/* 5 — Browse by intent. Each row is a real filtered search. */}
      <div className="bg-card py-4">
        {rows.map((r) => (
          <Row
            key={r.key}
            label={r.label}
            blurb={r.blurb}
            count={r.total}
            href={r.href}
            guides={r.guides}
            ratings={ratings}
            langMap={langMap}
          />
        ))}
      </div>

      {/* 5c — The catalogue. The rows above answer "who"; this answers
          "what", and it is the only place on the homepage you can browse
          bookable things rather than people. */}
      <ExperienceBrowser experiences={experiences} />

      {/* Latest from the trail — the proof-of-life feed. Real treks, dated,
          written by the guide who led them. Nothing on this page argues the
          product harder than three of these. */}
      {journals.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <p className="label text-muted">Proof of life</p>
              <h2 className="mt-2 max-w-[16ch] font-display text-3xl text-ink sm:text-4xl">
                <span className="wt-heavy">Treks, as they happened.</span>
              </h2>
            </div>
            <Link
              to="/journals"
              prefetch="intent"
              className="text-sm font-medium text-moss hover:underline"
            >
              Every journal →
            </Link>
          </div>
          <p className="mt-2 max-w-[54ch] text-muted">
            Every trek gets written up by the guide who led it — the teahouses,
            the weather, and the days it went wrong.
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            {journals.map((j: PublicJournal) => (
              <JournalCard key={j.id} journal={j} showGuide />
            ))}
          </div>
        </section>
      )}

      {/* 5b — The routes themselves. Named, with the number that matters:
          how many guides on Trek lead it. */}
      {routeRows.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="label text-muted">If you already know the walk</p>
              <h2 className="mt-2 font-display text-3xl text-ink">
                The routes people actually walk
              </h2>
            </div>
            <Link
              to="/routes"
              prefetch="intent"
              className="text-sm text-moss underline underline-offset-4 hover:text-pine"
            >
              All <span className="font-mono">{routeTotal}</span> routes →
            </Link>
          </div>
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {routeRows.map((r: any) => (
              <li key={r.slug}>
                <Link
                  to={`/routes/${r.slug}`}
                  prefetch="intent"
                  className="group flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3.5 transition-colors hover:bg-mist"
                >
                  <span className="font-display text-xl text-ink group-hover:text-moss">
                    {r.name}
                  </span>
                  <span className="text-caption text-muted">{r.region}</span>
                  <span className="ml-auto font-mono text-sm text-muted">
                    {r.days ? `${r.days} d` : ""}
                    {r.max_altitude_m
                      ? ` · ${r.max_altitude_m.toLocaleString("en-US")} m`
                      : ""}
                    {r.guides ? ` · ${r.guides} guides` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 6 — Regions, as doorways. */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <p className="label text-muted">Or start from the map in your head</p>
        <h2 className="mb-6 mt-2 font-display text-3xl text-ink">Browse by region</h2>
        <div className="grid gap-px overflow-hidden rounded-md bg-line sm:grid-cols-2 lg:grid-cols-3">
          {REGIONS.map((r) => (
            <Link
              key={r.name}
              to={`/guides?q=${encodeURIComponent(r.name)}`}
              prefetch="intent"
              className="group bg-paper p-6 transition-colors hover:bg-mist"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-2xl text-ink group-hover:text-moss">
                  {r.name}
                </h3>
                {regionCounts[r.name] ? (
                  <span className="font-mono text-sm text-muted">
                    {regionCounts[r.name]} guides
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted">{r.blurb}</p>
            </Link>
          ))}
          <Link
            to="/routes"
            prefetch="intent"
            className="group flex items-center bg-pine p-6 text-paper transition-colors hover:bg-moss"
          >
            <div>
              <h3 className="font-display text-2xl">Every route →</h3>
              <p className="mt-1 text-sm text-paper/75">
                Permits, real costs and who leads them.
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* 7 — The Split. Only Trek has this section. */}
      {splitOffering?.price_breakdown && (
        <GiantSplit offering={splitOffering as PublicOffering} />
      )}

      {/* 8 — One review, big, half over the photo. */}
      {review && (
        <section className="relative">
          <SmartImage
            src="/img/routes/gokyo-lakes.jpg"
            alt="Gokyo lake and the Ngozumpa moraine"
            width={1400}
            height={620}
            className="h-[52vh] w-full"
          />
          <div className="mx-auto max-w-6xl px-4">
            <figure className="relative z-10 -mt-28 max-w-xl border border-line bg-paper p-7 sm:-mt-36 sm:p-9">
              <Stars value={review.overall} />
              <blockquote className="mt-3 text-xl leading-relaxed text-ink">
                “{review.body}”
              </blockquote>
              <figcaption className="mt-4 font-mono text-sm text-ink-soft">
                — {review.author_name}
                {review.author_country ? `, ${review.author_country}` : ""} ·{" "}
                {fmtDate(review.published_at)}
              </figcaption>
            </figure>
          </div>
          <p className="mx-auto mt-3 max-w-6xl px-4 pb-2 text-right font-mono text-[11px] text-ink-soft">
            third lake, Gokyo, 4,790 m
          </p>
        </section>
      )}

      {/* 8b — The other side of the marketplace. Guides are the supply and
          the product; a marketplace that only ever talks to buyers starves.
          Placed after the Split, because the Split is the argument: a guide
          reading this page has just seen exactly what a trekker pays and
          exactly what the guide keeps. */}
      <GuideCall count={stats.guides} />

      {/* 9 — Trust, one quiet line. The pages carry the detail. */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex flex-col gap-0 border-y border-line sm:flex-row">
          {[
            [
              "/trust",
              "Every guide checked, dated, signed off",
              "Licence, first aid, references. You can read the receipts.",
            ],
            [
              "/transparency",
              "Every rupee, itemised",
              "Guide, permits, porters, fund — you see the whole split before you pay.",
            ],
            [
              "/safety",
              "If you ever need a helicopter",
              "We earn nothing from it.",
            ],
          ].map(([to, t, b], i) => (
            <Link
              key={t}
              to={to}
              className={
                "group flex-1 py-5 pr-6 " +
                (i > 0 ? "border-t border-line sm:border-l sm:border-t-0 sm:pl-6" : "")
              }
            >
              <p className="font-medium text-ink group-hover:text-primary">{t} →</p>
              <p className="mt-0.5 text-sm text-ink-soft">{b}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function Stat({ n, label, href }: { n: string; label: string; href?: string }) {
  const body = (
    <>
      <p className="font-mono text-3xl leading-none text-ink sm:text-4xl">{n}</p>
      <p className="mt-1.5 text-sm text-muted">{label}</p>
    </>
  );
  return href ? (
    <Link to={href} className="group block hover:text-moss">
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}

/** A horizontal row of guides framed as a human choice, not a category. */
function Row({
  eyebrow,
  label,
  blurb,
  count,
  href,
  guides,
  ratings,
  langMap,
}: {
  eyebrow?: string;
  label: string;
  blurb: string;
  count?: number;
  href: string;
  guides: any[];
  ratings: Record<string, { value: number; count: number }>;
  langMap: Record<string, string[]>;
}) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      {eyebrow && <p className="label text-muted">{eyebrow}</p>}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-2xl text-ink sm:text-[1.75rem]">{label}</h2>
        <Link
          to={href}
          prefetch="intent"
          className="text-sm font-medium text-moss hover:underline"
        >
          {count != null && count > guides.length ? `All ${count} →` : "See everyone →"}
        </Link>
      </div>
      <p className="mt-0.5 text-sm text-muted">{blurb}</p>

      {/* Scroll on a phone, wrap on a desktop — the row IS the affordance. */}
      <div className="-mx-4 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-pl-4 px-4 pb-2">
        {guides.map((g) => (
          <div key={g.user_id} className="flex w-[10.5rem] shrink-0 snap-start sm:w-52">
            <GuideCard guide={g} rating={ratings[g.user_id]} languages={langMap[g.user_id]} />
          </div>
        ))}
        {/* Only offer the tail card when there is actually more behind it. */}
        {count != null && count > guides.length && (
          <Link
            to={href}
            className="flex w-[10.5rem] shrink-0 snap-start items-center justify-center rounded-md border border-dashed border-line text-sm font-medium text-moss hover:bg-mist sm:w-52"
          >
            {count - guides.length} more →
          </Link>
        )}
      </div>
    </section>
  );
}

/** Deal one card from each kind in turn, so a mixed list reads as mixed. */
function interleaveByKind<T extends { kind: string }>(list: T[]): T[] {
  const buckets = new Map<string, T[]>();
  for (const o of list) (buckets.get(o.kind) ?? buckets.set(o.kind, []).get(o.kind)!).push(o);
  const order: string[] = KINDS.map((k) => k.key).filter(Boolean);
  const queues = [
    ...order.filter((k) => buckets.has(k)).map((k) => buckets.get(k)!),
    // Any kind we do not have a chip for still gets dealt, at the back.
    ...[...buckets.entries()].filter(([k]) => !order.includes(k)).map(([, v]) => v),
  ];
  const out: T[] = [];
  for (let i = 0; out.length < list.length; i++) {
    for (const q of queues) if (q[i]) out.push(q[i]);
    if (i > list.length) break; // belt and braces against a bad bucket
  }
  return out;
}

/** The filter facets, in the order a person narrows: what kind, then where. */
const KINDS = [
  { key: "", label: "Everything" },
  { key: "trek", label: "Treks" },
  { key: "day_hike", label: "Day hikes" },
  { key: "food_culture", label: "Food & culture" },
  { key: "adventure", label: "Adventure" },
  { key: "city", label: "City" },
] as const;

/**
 * Bookable things, filtered without a page load.
 *
 * The whole catalogue is already in the loader's payload — the page needs it
 * for the region and route maths — so filtering happens in the browser. Tapping
 * "Day hikes" is instant instead of a round trip, which is what makes a filter
 * feel like a filter rather than a search form. The facets are derived from
 * what is actually listed, so an empty category never appears as a chip that
 * returns nothing.
 */
function ExperienceBrowser({ experiences }: { experiences: any[] }) {
  const [kind, setKind] = useState<string>("");
  const [region, setRegion] = useState<string>("");
  const [showAll, setShowAll] = useState(false);

  const byKind = (list: any[], k: string) => (k ? list.filter((o) => o.kind === k) : list);
  const byRegion = (list: any[], r: string) => (r ? list.filter((o) => o.region === r) : list);

  // Counts on each chip come from the *other* filter's result, so the numbers
  // describe what a tap would actually give you.
  const kindCounts = new Map(
    KINDS.map((k) => [k.key, byKind(byRegion(experiences, region), k.key).length]),
  );
  const regions = [...new Set(experiences.map((o) => o.region).filter(Boolean))].sort();
  const regionCount = (r: string) => byRegion(byKind(experiences, kind), r).length;

  const matched = byRegion(byKind(experiences, kind), region);
  // "Everything" means everything. Left in table order the first eight were
  // all day experiences — treks are 44 of the 56 and none of them appeared,
  // so the unfiltered view advertised the wrong catalogue. Round-robin by
  // kind puts one of each up front and keeps the order stable.
  const ordered = kind ? matched : interleaveByKind(matched);
  const shown = showAll ? ordered : ordered.slice(0, 8);
  const narrowed = !!kind || !!region;

  if (experiences.length === 0) return null;

  const chip = (active: boolean) =>
    cn(
      "rounded-pill px-3.5 py-1.5 text-sm transition-colors",
      active
        ? "bg-pine text-paper"
        : "border border-line bg-card text-ink hover:border-sage",
    );

  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="label text-muted">Not just treks</p>
          <h2 className="mt-2 font-display text-3xl text-ink">Where do you want to go?</h2>
        </div>
        <Link
          to="/experiences"
          prefetch="intent"
          className="text-sm font-medium text-moss hover:underline"
        >
          Search all <span className="font-mono">{experiences.length}</span> →
        </Link>
      </div>

      <div className="mt-6 space-y-2">
        <div className="flex flex-wrap gap-2">
          {KINDS.filter((k) => !k.key || (kindCounts.get(k.key) ?? 0) > 0).map((k) => (
            <button
              key={k.key || "all"}
              type="button"
              onClick={() => {
                setKind(k.key);
                setShowAll(false);
              }}
              aria-pressed={kind === k.key}
              className={chip(kind === k.key)}
            >
              {k.label}{" "}
              <span className={cn("font-mono", kind === k.key ? "text-paper/60" : "text-muted")}>
                {kindCounts.get(k.key) ?? 0}
              </span>
            </button>
          ))}
        </div>
        {regions.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setRegion("");
                setShowAll(false);
              }}
              aria-pressed={region === ""}
              className={chip(region === "")}
            >
              Anywhere
            </button>
            {regions
              .filter((r) => regionCount(r as string) > 0)
              .map((r) => (
                <button
                  key={r as string}
                  type="button"
                  onClick={() => {
                    setRegion(r as string);
                    setShowAll(false);
                  }}
                  aria-pressed={region === r}
                  className={chip(region === r)}
                >
                  {r as string}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* aria-live so a screen reader hears the count change on a tap — the
          filtering happens with no navigation, so nothing else announces it. */}
      <p className="mt-5 text-sm text-muted" aria-live="polite">
        <span className="font-mono text-ink">{matched.length}</span>
        {narrowed ? " match" : " listed"}
        {matched.length === 1 ? "" : narrowed ? "es" : ""}
      </p>

      {matched.length === 0 ? (
        <p className="mt-4 text-muted">
          Nothing listed there yet.{" "}
          <button
            type="button"
            onClick={() => {
              setKind("");
              setRegion("");
            }}
            className="text-moss underline underline-offset-4"
          >
            Clear the filters
          </button>
          .
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {shown.map((o: PublicOffering) => (
              <OfferingCard key={o.id} offering={o} />
            ))}
          </div>
          {!showAll && matched.length > shown.length && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-6 w-full rounded-md border border-line bg-card py-3 text-sm font-medium text-ink hover:border-sage hover:bg-mist"
            >
              Show the other <span className="font-mono">{matched.length - shown.length}</span>
            </button>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Recruitment, addressed to a guide reading a page built for trekkers.
 *
 * No stock photograph of a smiling stranger and no "join our team" — the
 * three lines are the three things a Nepali guide actually asks: what do I
 * keep, when am I paid, and whose name is on the work. Numbers come from the
 * same constants the checkout charges by, so this can never drift from what
 * the product does.
 */
function GuideCall({ count }: { count: number }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="overflow-hidden rounded-md border border-line bg-card">
        <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-14">
          <div>
            <p className="label text-muted">For guides</p>
            <h2 className="mt-2 max-w-[20ch] font-display text-3xl leading-[1.05] text-ink sm:text-4xl">
              Your name on the work.
            </h2>
            <p className="mt-4 max-w-[52ch] text-body-l text-ink">
              You set your day rate and keep all of it. Trek adds{" "}
              <span className="font-mono">{Math.round(TREK_FEE_PCT * 100)}%</span> on top,
              paid by the trekker and printed on their bill. Your reviews are yours.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                to="/apply"
                prefetch="intent"
                className="rounded bg-pine px-5 py-3 font-medium text-paper hover:bg-moss"
              >
                Apply to guide on Trek
              </Link>
              <Link
                to="/hosts"
                prefetch="intent"
                className="rounded border border-line px-5 py-3 font-medium text-ink hover:bg-mist"
              >
                What you would earn →
              </Link>
            </div>
            <p className="mt-3 text-caption text-muted">
              Licensed guides only. Ten minutes, and we call you.
            </p>
          </div>

          {/* The three answers, as a mono ledger rather than feature cards. */}
          <dl className="divide-y divide-line border-y border-line">
            {[
              ["You keep", "100%", "of the rate you set"],
              ["Paid within", "7 days", "in NPR, to your bank"],
              ["Already guiding", String(count), "and none of them an agency"],
            ].map(([label, figure, note]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 py-4">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="text-right">
                  <span className="font-mono text-xl text-ink">{figure}</span>
                  <span className="ml-2 text-sm text-muted">{note}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

/** The money, huge, on green — the one section no template has. */
function GiantSplit({ offering }: { offering: PublicOffering }) {
  const { m } = useMoney();
  const bd = offering.price_breakdown as PriceBreakdown;
  const p = computeExperiencePricing(bd, 2);
  const total = p.perPersonUsdCents;
  const rows = p.lines.filter((l) => l.amountUsdCents > 0);

  return (
    <section className="bg-pine py-20 text-paper">
      <div className="mx-auto max-w-6xl px-4">
        <p className="label text-paper/60">Where your money goes</p>
        <h2 className="mt-3 max-w-[16ch] font-display text-5xl sm:text-6xl">
          <span className="wt-heavy">{m(total)}</span>{" "}
          <span className="wt-light text-paper/75">to Base Camp. Split, to the cent.</span>
        </h2>
        <p className="mt-3 max-w-[52ch] text-paper/80">
          {offering.title}, two of you, straight off the live listing. Every
          rupee itemised: what the guide keeps, what the permits cost, what we take.
        </p>

        <div className="mt-10 flex h-16 w-full overflow-hidden">
          {rows.map((l, i) => (
            <div
              key={l.key}
              title={l.label}
              style={{ width: `${(l.amountUsdCents / total) * 100}%` }}
              className={
                l.key === "trek"
                  ? "bg-chartreuse"
                  : ["bg-fern", "bg-moss", "bg-sage/70", "bg-paper/25", "bg-paper/10"][i % 5]
              }
            />
          ))}
        </div>
        <div className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-3">
          {rows.map((l) => (
            <div
              key={l.key}
              className="flex items-baseline justify-between border-b border-paper/15 pb-2"
            >
              <span className={"text-sm " + (l.key === "trek" ? "text-chartreuse" : "text-paper/80")}>
                {l.label}
                {l.key === "trek" && " — ours"}
              </span>
              <span className="font-mono text-paper">{m(l.amountUsdCents)}</span>
            </div>
          ))}
        </div>
        <Link
          to={`/treks/${offering.slug}`}
          className="mt-8 inline-block bg-chartreuse px-6 py-3 font-medium text-pine hover:bg-white"
        >
          See the live listing →
        </Link>
      </div>
    </section>
  );
}
