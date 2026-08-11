import { Link } from "react-router";
import type { Route } from "./+types/home";
import { copy } from "~/lib/copy";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { createAdminClient, createPublicClient, getEnv } from "~/lib/supabase.server";
import { fundCollected } from "~/lib/fund.server";
import { guideRatings } from "~/lib/ratings.server";
import { GuideCard, type PublicGuide, type PublicOffering } from "~/components/public/cards";
import { Stars } from "~/components/public/bits";
import { SmartImage } from "~/components/SmartImage";
import { HeroSearch } from "~/components/public/HeroSearch";
import { GuideMap, type MapPin, type MapRoute } from "~/components/public/GuideMap";
import { computeExperiencePricing, type PriceBreakdown } from "~/lib/experience-pricing";
import { useMoney } from "~/lib/currency-context";
import { INTENTS, REGIONS, matchesKeywords } from "~/lib/intents";
import { addDays } from "~/lib/browse";
import { fmtDate, fmtDateShort } from "~/lib/format";
import { openRunsByGuide } from "~/lib/browse.server";
import { JournalCard } from "~/components/public/JournalCard";
import { JOURNAL_COLS, type PublicJournal } from "~/lib/journals";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return pageMeta({
    title: "Trek — pick your guide, not your agency",
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
          "id, slug, kind, route_id, title, summary, days, price_usd_cents, price_breakdown, max_party, cover_photo_url, guide_id, guide_slug, guide_name, guide_avatar_url, guide_tier, guide_day_rate_usd_cents",
        ),
      client.from("routes").select("id, slug, name, region"),
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

  return {
    rows,
    freeThisWeek: freeThisWeek.slice(0, 8),
    freeThisWeekTotal: freeThisWeek.length,
    freeRuns,
    pins,
    routes: (routes ?? []).map((r) => ({ slug: r.slug, name: r.name, region: r.region })) as MapRoute[],
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
    freeThisWeek,
    freeThisWeekTotal,
    pins,
    routes,
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
            <span className="wt-heavy">Pick your guide,</span>{" "}
            <span className="wt-light text-white/90">not your agency.</span>
          </h1>
          <p className="mt-4 max-w-[46ch] text-lg text-white/85">
            {stats.guides} verified Nepali guides, each with their own trips. Search
            what you want to walk — you'll meet the person before you pay.
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
          label="Free this week"
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

      {/* Latest from the trail — the proof-of-life feed. Real treks, dated,
          written by the guide who led them. Nothing on this page argues the
          product harder than three of these. */}
      {journals.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <p className="label text-muted">Proof of life</p>
              <h2 className="mt-2 max-w-[16ch] font-display text-3xl text-ink sm:text-4xl">
                <span className="wt-heavy">Latest from the trail.</span>
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

      {/* 9 — Trust, one quiet line. The pages carry the detail. */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex flex-col gap-0 border-y border-line sm:flex-row">
          {[
            ["/trust", "Verification receipts", "every check, dated, public"],
            ["/transparency", "The whole price", "guide fee, permits, our cut — printed"],
            ["/fund", "The Fund", "3% of every trek, spent on the trail"],
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
          {count != null && count > guides.length ? `All ${count} →` : "See all →"}
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
          {offering.title}, two of you, real numbers from the live listing. No package
          totals, no mystery margin — this is the whole point of Trek.
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
