import { Link } from "react-router";
import type { Route } from "./+types/home";
import { copy } from "~/lib/copy";
import { pageMeta, absoluteUrl, jsonLd, websiteLd } from "~/lib/seo";
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
import { AscentStats } from "~/components/public/AscentStats";
import { TrailAtlas } from "~/components/public/TrailAtlas";
import { fanOut } from "~/lib/atlas";
import { DISTRICT_CENTRES } from "~/lib/geo";
import { routeLine } from "~/lib/map-stops";
import { computeExperiencePricing, type PriceBreakdown } from "~/lib/experience-pricing";
import { useMoney } from "~/lib/currency-context";
import { INTENTS, REGIONS, matchesKeywords } from "~/lib/intents";
import {
  categoryIsReady,
  membersOf,
  orderCategories,
  type Category,
} from "~/lib/categories";
import { addDays } from "~/lib/browse";
import { TREK_FEE_PCT } from "~/lib/config";
import { fmtDate, fmtDateShort } from "~/lib/format";
import { openRunsByGuide } from "~/lib/browse.server";
import { JournalCard } from "~/components/public/JournalCard";
import { JOURNAL_COLS, type PublicJournal } from "~/lib/journals";
import { StatRow, StatTile } from "~/components/design/StatTile";
import { Glyph, type ChipGlyph } from "~/components/design/Chip";
import { Chip } from "~/components/design/Chip";
import { PhotoCard } from "~/components/design/PhotoCard";
import { GlassPill } from "~/components/design/Glass";
import { KIND_GLYPH } from "~/components/public/cards";
import { featuredReview } from "~/lib/featured-review";
import { Standards, SmallestStep } from "~/components/public/Standards";
import { TREK_REGIONS, inRegion } from "~/lib/trek-regions";
import { profileOf } from "~/lib/route-cards";

export { publicCacheHeaders as headers } from "~/lib/cache-headers";


export function meta({ loaderData: data }: Route.MetaArgs) {
  const canonical = data?.canonical ?? "";
  const tags = [
    ...pageMeta({
      title: "Guides of Nepal \u2014 know who\u2019s walking with you",
      description: copy.brand.tagline,
      canonical,
    }),
  ];
  // WebSite + SearchAction: the sitelinks searchbox, and how an agent learns
  // our query URL instead of guessing one. Only ever on the homepage —
  // Google reads it from the site root.
  if (canonical) tags.push(jsonLd(websiteLd(new URL(canonical).origin)));
  return tags;
}

type HomeGuide = PublicGuide & {
  bio: string | null;
  only_with_me: string | null;
  gender: string | null;
  years_experience: number | null;
  treks_completed_platform: number;
};

const GUIDE_COLS =
  "user_id, slug, full_name, avatar_url, home_district, regions, tier, hook_line, bio, only_with_me, gender, years_experience, day_rate_usd_cents, median_response_mins, treks_completed_platform";

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
          "id, slug, kind, route_id, title, summary, days, price_usd_cents, price_breakdown, max_party, cover_photo_url, guide_id, guide_slug, guide_name, guide_avatar_url, guide_tier, guide_day_rate_usd_cents, guide_years_experience, route_slug, route_name",
        ),
      client
        .from("routes")
        .select("id, slug, name, region, typical_days, max_altitude_m, difficulty, sort, day_stops")
        .order("sort"),
      client
        .from("public_reviews")
        .select("id, overall, body, published_at, author_name, author_country, offering_slug")
        .order("published_at", { ascending: false })
        .limit(40),
      // Same helper /fund uses — the two numbers must never disagree.
      fundCollected(createAdminClient(env), { sinceStartDate: yearStart }),
      // Proof of life: the most recent treks anyone actually walked.
      client
        .from("public_journals")
        .select(JOURNAL_COLS)
        .order("start_date", { ascending: false })
        .limit(3),
    ]);

  // The rows somebody made, rather than the ones a developer wrote (0067).
  const [{ data: categoryRows }, { data: picks }, { data: skillRows }] = await Promise.all([
    client
      .from("categories")
      .select("id, slug, label, blurb, auto_skill, live, sort, min_guides")
      .eq("live", true)
      .order("sort"),
    client.from("guide_categories").select("category_id, guide_id, sort"),
    client.from("guide_skills").select("guide_id, skill"),
  ]);
  const skillsByGuide: Record<string, string[]> = {};
  for (const r of skillRows ?? []) (skillsByGuide[r.guide_id] ??= []).push(r.skill);

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

  // What kind of trip each review is about, for picking the featured one.
  const kindBySlug = new Map<string, string>(
    ((offerings ?? []) as any[]).map((o) => [o.slug, o.kind]),
  );

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
  // listed: how many guides here actually lead it.
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

  // Only what a card renders. The rows used to carry the whole guide row —
  // bio included — for every guide in every row, so a paragraph of prose per
  // guide was serialised into the page and parsed again in the browser, to be
  // read by nothing. The long text is needed here, for the keyword matching,
  // and nowhere after it. (This page runs to the Worker's CPU limit; the
  // cheapest millisecond is the one spent on something nobody reads.)
  const pick = (g: HomeGuide) => ({
    user_id: g.user_id,
    slug: g.slug,
    full_name: g.full_name,
    avatar_url: g.avatar_url,
    home_district: g.home_district,
    tier: g.tier,
    hook_line: g.hook_line,
    only_with_me: g.only_with_me,
    day_rate_usd_cents: g.day_rate_usd_cents,
    median_response_mins: g.median_response_mins,
  });

  // Curated rows first: they are this week's judgement, and the evergreen
  // intent rows below them are the standing furniture.
  const byCategory = new Map<string, Array<{ guide_id: string; sort: number }>>();
  for (const p of picks ?? []) {
    (byCategory.get(p.category_id) ?? byCategory.set(p.category_id, []).get(p.category_id))!.push(p);
  }
  const categoryRowsOut = orderCategories((categoryRows ?? []) as Category[])
    .map((c) => {
      const members = membersOf(c, all, byCategory.get(c.id) ?? [], skillsByGuide);
      return {
        key: `c:${c.slug}`,
        label: c.label,
        blurb: c.blurb ?? "",
        href: `/guides?category=${c.slug}`,
        total: members.length,
        guides: members.slice(0, 8).map(pick),
        ready: categoryIsReady(c, members.length),
      };
    })
    .filter((r) => r.ready);

  // A curated row that names a skill replaces the built-in row for that same
  // skill rather than sitting next to it — otherwise turning on "Photographers"
  // in the console shows the reader two rows of the same people.
  const claimedSkills = new Set(
    ((categoryRows ?? []) as Category[]).map((c) => c.auto_skill).filter(Boolean) as string[],
  );

  const rows = INTENTS.filter((i) => !(i.skill && claimedSkills.has(i.skill))).map((intent) => {
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

  // The atlas: trails, and the people who walk them.
  //
  // The old version of this was one pin per district carrying a count — a map
  // of administrative density, which is the least interesting thing we know.
  // What we have that nobody else does is named people attached to specific
  // trails, so that is what goes on the map.
  const atlasTrails = (routes ?? [])
    .map((r: any) => ({
      slug: r.slug,
      name: r.name,
      region: r.region,
      days: r.typical_days ?? null,
      maxAltitudeM: r.max_altitude_m ?? null,
      // Day stops carry the real walking line; a route without one cannot be
      // drawn and is filtered out downstream rather than drawn as a dot.
      coords: routeLine(
        (Array.isArray(r.day_stops) ? r.day_stops : []).map((d: any) => ({
          day: Number(d.day) || 0,
          place: String(d.place ?? ""),
          altitude_m: Number(d.altitude_m) || 0,
          lat: d.lat == null ? null : Number(d.lat),
          lng: d.lng == null ? null : Number(d.lng),
        })),
      ),
      // The villages themselves, which is what a person types into a search
      // box. "Namche" is a place someone has heard of; "everest-base-camp"
      // is a slug we invented.
      places: (Array.isArray(r.day_stops) ? r.day_stops : [])
        .filter((d: any) => d.lat != null && d.lng != null && String(d.place ?? "").trim())
        .map((d: any) => ({
          day: Number(d.day) || 0,
          name: String(d.place).trim(),
          lng: Number(d.lng),
          lat: Number(d.lat),
          altitudeM: Number(d.altitude_m) || 0,
        })),
    }))
    .filter((t) => t.coords.length >= 2);

  const atlasGuides = fanOut(
    all
      .map((g) => {
        const centre = g.home_district
          ? DISTRICT_CENTRES[g.home_district as keyof typeof DISTRICT_CENTRES]
          : null;
        if (!centre) return null;
        return {
          id: g.user_id,
          slug: g.slug,
          name: g.full_name,
          avatar: g.avatar_url,
          tier: g.tier ?? 0,
          hook: g.only_with_me || g.hook_line || null,
          district: g.home_district,
          regions: ((g as any).regions ?? []) as string[],
          lng: centre[0],
          lat: centre[1],
        };
      })
      .filter(Boolean) as any[],
  );

  // Where our guides live, for place search. Not drawn on the map — the old
  // district bubbles were exactly what we removed — but somebody typing
  // "Solukhumbu" should still land somewhere.
  const districtGuideCounts: Record<string, number> = {};
  for (const g of all) {
    if (g.home_district) {
      districtGuideCounts[g.home_district] = (districtGuideCounts[g.home_district] ?? 0) + 1;
    }
  }
  const atlasDistricts = Object.entries(districtGuideCounts)
    .map(([name, guides]) => {
      const centre = DISTRICT_CENTRES[name as keyof typeof DISTRICT_CENTRES];
      return centre ? { name, lng: centre[0], lat: centre[1], guides } : null;
    })
    .filter(Boolean) as { name: string; lng: number; lat: number; guides: number }[];

  // The strong link: a guide who sells a trip on this route is somebody you
  // can book for it today, which is a different claim from "works nearby".
  const atlasOfferings = ((offerings ?? []) as any[])
    .filter((o) => o.route_slug && o.guide_id)
    .map((o) => ({ guideId: o.guide_id as string, routeSlug: o.route_slug as string }));

  // The Split section uses one real trek's real numbers.
  const splitOffering =
    (offerings ?? []).find((o) => o.slug === "ebc-classic-with-pemba" && o.price_breakdown) ??
    (offerings ?? []).find((o) => o.kind === "trek" && o.price_breakdown) ??
    null;

  // One card per region, pointing at its own page rather than a query
  // string, with something true on it even where we have no photograph.
  //
  // Mustang's card was blank and countless: no photo in REGION_PHOTO and no
  // guide with Mustang in their regions, so the pill was hidden and the image
  // fell back to bare contour. Seven of the eleven regions were in that
  // state. The house rule is terrain rather than stock photography, so the
  // fix is not to borrow a Langtang photograph — it is to draw the region's
  // OWN longest trail in the placeholder, and to count its routes when it
  // has no guides yet.
  const regionCards = TREK_REGIONS.map((tr) => {
    const inThis = ((routes ?? []) as any[]).filter((r) => inRegion(tr, r.region));
    const longest = [...inThis].sort(
      (a, b) => (b.typical_days ?? 0) - (a.typical_days ?? 0),
    )[0];
    const stops = (Array.isArray(longest?.day_stops) ? longest.day_stops : [])
      .map((d: any) => ({
        day: Number(d.day) || 0,
        place: String(d.place ?? ""),
        altitude_m: Number(d.altitude_m) || 0,
      }))
      .filter((d: any) => d.altitude_m > 0);
    return {
      slug: tr.slug,
      name: tr.name,
      blurb: tr.intent,
      values: tr.values,
      routeCount: inThis.length,
      profile: stops.length >= 3 ? profileOf(stops) : null,
    };
  });

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
    categoryRows: categoryRowsOut,
    rows,
    experiences,
    freeThisWeek: freeThisWeek.slice(0, 8).map(pick),
    freeThisWeekTotal: freeThisWeek.length,
    freeRuns,
    atlasTrails,
    atlasGuides,
    atlasOfferings,
    atlasDistricts,
    routeRows,
    routeTotal: (routes ?? []).length,
    regionCounts,
    regionCards,
    ratings,
    langMap,
    splitOffering,
    // Not the newest — the most convincing. The newest was 4.0 stars about a
    // yoga class, on a page selling a fortnight at altitude. The kind comes
    // from the offerings this page already has in hand, mapped by slug.
    review: featuredReview(
      ((reviews ?? []) as any[]).map((r) => ({
        ...r,
        kind: kindBySlug.get(r.offering_slug) ?? null,
      })),
    ),
    journals: (journals ?? []) as PublicJournal[],
    // Four real guides for the numbers band. "49 verified guides" is an
    // abstraction; four people looking at you is the argument this company
    // makes, and their photographs are already loaded.
    statFaces: all
      .filter((g) => g.avatar_url)
      .slice(0, 4)
      .map((g) => ({ slug: g.slug, name: g.full_name, avatar: g.avatar_url })),
    stats: {
      guides: all.length,
      districts: new Set(all.map((g) => g.home_district).filter(Boolean)).size,
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
    categoryRows,
    rows,
    experiences,
    freeThisWeek,
    freeThisWeekTotal,
    atlasTrails,
    atlasGuides,
    atlasOfferings,
    atlasDistricts,
    routeRows,
    routeTotal,
    regionCounts,
    regionCards,
    ratings,
    langMap,
    splitOffering,
    review,
    journals,
    stats,
    statFaces,
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
            {/* The page's one lime (docs/07): the thing to do from here. */}
            <Link
              to="/match"
              prefetch="intent"
              className="inline-flex h-11 items-center gap-2 rounded-button bg-chartreuse px-5 font-medium text-pine shadow-card transition duration-instant hover:brightness-[0.97] active:scale-[0.97]"
            >
              <Glyph name="spark" className="text-pine" />
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

      {/* 2 — Live numbers, as a climb rather than five identical tiles.
          See AscentStats for why. The order is the ascent: the rescue-flight
          number is last and highest because it is the one that is about
          whether you come home. */}
      <AscentStats
        faces={statFaces}
        stats={[
          { glyph: "check", value: String(stats.guides), label: "verified guides", href: "/guides" },
          { glyph: "pin", value: String(stats.districts), label: "home districts" },
          { glyph: "mountain", value: stats.treksLed.toLocaleString("en-US"), label: "treks led" },
          { glyph: "spark", value: mr(stats.fundUsdCents), label: "to The Fund this year", href: "/fund" },
          // "taken on rescue flights" left a reader asking taken from whom,
          // by whom, and why a currency symbol is on it. The claim underneath
          // is the strongest one on the row — Nepal has a documented
          // helicopter-evacuation kickback problem, and we earn nothing when
          // a trekker is flown out, so nobody here has a reason to call one
          // early. That is only worth printing if it says so.
          { glyph: "altitude", value: mr(0), label: "earned by us from rescue flights", href: "/safety", summit: true },
        ]}
      />

      {/* 2b — The fear, answered head-on.
          Everything else on this page argues the guides are good. This is the
          question underneath — fourteen days from a road with a stranger —
          and it was the one thing the page never said out loud. First
          screenful after the numbers, because it is the question that decides
          whether the rest gets read. */}
      <Standards />

      {/* 3 — The atlas. Not "we have guides in 25 districts" — a count is a
          claim about us. Pick a trail and meet the people who walk it, which
          is a claim about them, and the only one that has ever sold a trek. */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        {/* Heading left, the sentence that explains it right. Both used to be
            left-aligned at half the width, which left a column of nothing down
            the right of the page for no reason — the heading was not big
            enough to earn the space and the paragraph was not long enough to
            fill it. Two columns close the gap and put the explanation at the
            reader's eye instead of under their chin. Stacked on a phone. */}
        <div className="mb-5 grid items-end gap-x-10 gap-y-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <h2 className="max-w-[20ch] font-display text-3xl text-ink sm:text-4xl lg:text-[2.75rem]">
            <span className="wt-heavy">Pick a trail. Meet the people who walk it.</span>
          </h2>
          <p className="max-w-[52ch] text-muted lg:pb-1.5">
            Every line is a real route with real days on it. Every face is a
            verified guide you can book by name — not an agency, and not a
            stranger assigned to you the week you land.
          </p>
        </div>
        <TrailAtlas
          trails={atlasTrails}
          guides={atlasGuides}
          offerings={atlasOfferings}
          districts={atlasDistricts}
        />
      </section>

      {/* 4 — Free this week. Real availability, the most perishable thing we
          know, so it goes above the evergreen rows. */}
      {freeThisWeek.length > 0 && (
        <Row
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
        {/* The rows somebody made this week (0067), above the standing ones. */}
        {categoryRows.map((r: any) => (
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
        {rows.slice(0, 2).map((r) => (
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

      {/* 5c — The catalogue, in the MIDDLE of the guide rails rather than
          after all of them.
          The rows answer "who" and this answers "what", and a block of six
          people-rails followed by a block of things read as two catalogues
          bolted together. Alternating them keeps every row a fresh reason to
          book — which is what each row is for. */}
      <ExperienceBrowser experiences={experiences} ratings={ratings} />

      {rows.length > 2 && (
        <div className="bg-card py-4">
          {rows.slice(2).map((r) => (
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
      )}

      {/* Latest from the trail — the proof-of-life feed. Real treks, dated,
          written by the guide who led them. Nothing on this page argues the
          product harder than three of these. */}
      {journals.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <h2 className="max-w-[16ch] font-display text-3xl text-ink sm:text-4xl">
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
          how many guides here lead it. */}
      {routeRows.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-3xl text-ink">
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

      {/* 6 — Regions, as doorways to their own pages.
          These used to point at /guides?q=Khumbu — a query string, which
          search treats as one page with eleven sets of contents, and which is
          why "trekking in Annapurna" found nothing of ours. Each card is now
          a real indexable page (see lib/trek-regions). */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-3xl text-ink">Where do you want to walk?</h2>
        <p className="mb-6 mt-2 max-w-[54ch] text-muted">
          Ten regions, the trails in each, and the guides who live there.
        </p>
        {/* Doorways as pictures (docs/07): the region's own route photograph
            where we have one, and its own longest trail drawn as terrain
            where we do not — never a grey cell, and never a borrowed photo. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {regionCards.map((r: any) => {
            const photo = r.values.map((v: string) => REGION_PHOTO[v]).find(Boolean) ?? null;
            const guides = r.values.reduce(
              (n: number, v: string) => n + (regionCounts[v] ?? 0),
              0,
            );
            return (
              <PhotoCard
                key={r.slug}
                to={`/nepal/${r.slug}`}
                photo={photo}
                profile={photo ? null : r.profile}
                alt={`${r.name}, Nepal`}
                aspect="aspect-[4/3]"
                topRight={
                  // A count, always — guides if anyone works there, otherwise
                  // the trails, which is still a reason to open the page.
                  guides > 0 ? (
                    <GlassPill>
                      <Glyph name="people" className="text-moss" />
                      <span className="font-mono">{guides}</span>{" "}
                      {guides === 1 ? "guide" : "guides"}
                    </GlassPill>
                  ) : r.routeCount > 0 ? (
                    <GlassPill>
                      <Glyph name="route" className="text-moss" />
                      <span className="font-mono">{r.routeCount}</span>{" "}
                      {r.routeCount === 1 ? "route" : "routes"}
                    </GlassPill>
                  ) : undefined
                }
              >
                <h3 className="font-display text-xl leading-tight sm:text-2xl">{r.name}</h3>
                <p className={cn("mt-1 hidden text-sm sm:block", photo ? "text-paper/80" : "text-muted")}>
                  {r.blurb}
                </p>
              </PhotoCard>
            );
          })}
          <Link
            to="/routes"
            prefetch="intent"
            className="group flex aspect-[4/3] items-end rounded-photo bg-pine p-4 text-paper shadow-card transition duration-quick hover:-translate-y-0.5 hover:bg-moss sm:p-5"
          >
            <div>
              <h3 className="font-display text-xl sm:text-2xl">Every route →</h3>
              <p className="mt-1 hidden text-sm text-paper/75 sm:block">
                Permits, real costs and who leads them.
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* 7 — The Split. Only we have this section. */}
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

      {/* 8c — The smallest safe next step.
          Every other call to action here asks for a decision. Somebody who
          has read the standards and is still deciding needs a smaller one
          than any of them: ask a question, free, and see who answers. */}
      <SmallestStep />

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

function Stat({ n, label, href, glyph }: { n: string; label: string; href?: string; glyph?: ChipGlyph }) {
  // A fact as a tile (docs/07): the number big and mono, the label small.
  const body = <StatTile surface="bare" glyph={glyph} value={n} label={label} />;
  return href ? (
    <Link to={href} className="group block rounded-photo transition-colors hover:text-moss">
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}

/** A horizontal row of guides framed as a human choice, not a category. */
function Row({
  label,
  blurb,
  count,
  href,
  guides,
  ratings,
  langMap,
}: {
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
/** The route photograph that stands for a region — only where we have one. */
const REGION_PHOTO: Record<string, string> = {
  Khumbu: "/img/routes/everest-base-camp.jpg",
  Everest: "/img/routes/everest-base-camp.jpg",
  Annapurna: "/img/routes/annapurna-circuit.jpg",
  Langtang: "/img/routes/langtang-valley.jpg",
  Manaslu: "/img/routes/manaslu-circuit.jpg",
};

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
function ExperienceBrowser({
  experiences,
  ratings,
}: {
  experiences: any[];
  /** Guide ratings by guide id — the card's last line. */
  ratings: Record<string, { value: number; count: number }>;
}) {
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
          <h2 className="font-display text-3xl text-ink">Where do you want to go?</h2>
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
            <Chip
              key={k.key || "all"}
              glyph={k.key ? KIND_GLYPH[k.key] : undefined}
              selected={kind === k.key}
              onClick={() => {
                setKind(k.key);
                setShowAll(false);
              }}
            >
              {k.label}{" "}
              <span className={cn("font-mono", kind === k.key ? "text-paper/60" : "text-muted")}>
                {kindCounts.get(k.key) ?? 0}
              </span>
            </Chip>
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
              <OfferingCard key={o.id} offering={o} rating={ratings[(o as any).guide_id]} />
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
            <h2 className="max-w-[20ch] font-display text-3xl leading-[1.05] text-ink sm:text-4xl">
              Your name on the work.
            </h2>
            <p className="mt-4 max-w-[52ch] text-body-l text-ink">
              You set your day rate and keep all of it. We add{" "}
              <span className="font-mono">{Math.round(TREK_FEE_PCT * 100)}%</span> on top,
              paid by the trekker and printed on their bill. Your reviews are yours.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                to="/apply"
                prefetch="intent"
                className="inline-flex h-12 items-center rounded-button bg-chartreuse px-5 font-medium text-pine shadow-card transition duration-instant hover:brightness-[0.97] active:scale-[0.97]"
              >
                Apply to guide with us
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

          {/* The three answers as tiles (docs/07). */}
          <StatRow cols={3}>
            <StatTile glyph="check" value="100%" unit="of your rate" label="You keep" />
            <StatTile glyph="clock" value="7" unit="days, in NPR" label="Paid within" />
            <StatTile glyph="people" value={String(count)} unit="no agencies" label="Already guiding" />
          </StatRow>
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
