import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/home";
import { copy } from "~/lib/copy";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { guideRatings } from "~/lib/ratings.server";
import { GuideCard, OfferingCard, type PublicOffering } from "~/components/public/cards";
import { ReviewBlock, TierBadge, Stars } from "~/components/public/bits";
import { SmartImage } from "~/components/SmartImage";
import { computeExperiencePricing, type PriceBreakdown } from "~/lib/experience-pricing";
import { useMoney } from "~/lib/currency-context";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return pageMeta({
    title: "Trek — pick your guide, not your agency",
    description: copy.brand.tagline,
    canonical: data?.canonical ?? "",
  });
}

export async function loader({ context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);

  const [{ data: guides }, { data: offerings }, { data: reviews }] = await Promise.all([
    client
      .from("public_guides")
      .select(
        "user_id, slug, full_name, avatar_url, home_district, tier, hook_line, bio, years_experience, day_rate_usd_cents, median_response_mins, treks_completed_platform",
      )
      .order("tier", { ascending: false })
      .limit(8),
    client
      .from("public_offerings")
      .select(
        "id, slug, kind, title, summary, days, price_usd_cents, price_breakdown, max_party, cover_photo_url, guide_slug, guide_name, guide_avatar_url, guide_tier, guide_day_rate_usd_cents",
      )
      .limit(24),
    client
      .from("public_reviews")
      .select("id, overall, body, published_at, author_name, author_country")
      .order("published_at", { ascending: false })
      .limit(4),
  ]);

  const ids = (guides ?? []).map((g) => g.user_id);
  const ratings = await guideRatings(client, ids);
  const languagesByGuide: Record<string, string[]> = {};
  if (ids.length) {
    const { data: langs } = await client
      .from("guide_languages")
      .select("guide_id, language")
      .in("guide_id", ids);
    for (const l of langs ?? []) (languagesByGuide[l.guide_id] ??= []).push(l.language);
  }

  // The Split section uses one real trek's real numbers — EBC if present.
  const splitOffering =
    (offerings ?? []).find((o) => o.slug === "ebc-classic-with-pemba" && o.price_breakdown) ??
    (offerings ?? []).find((o) => o.kind === "trek" && o.price_breakdown) ??
    null;

  return {
    guides: guides ?? [],
    offerings: (offerings ?? []) as PublicOffering[],
    reviews: reviews ?? [],
    ratings,
    languagesByGuide,
    splitOffering,
    canonical: absoluteUrl(env.SITE_URL, "/"),
  };
}

const CATEGORIES = [
  { kind: "trek", label: "Treks" },
  { kind: "day_hike", label: "Day hikes" },
  { kind: "food_culture", label: "Food & culture" },
  { kind: "adventure", label: "Adventure" },
  { kind: "city", label: "City" },
] as const;

export default function Home({ loaderData }: Route.ComponentProps) {
  const { guides, offerings, reviews, ratings, languagesByGuide, splitOffering } = loaderData;
  const [cat, setCat] = useState<string>("trek");
  const shown = offerings.filter((o) => o.kind === cat).slice(0, 6);
  const featured = guides[0];
  const restGuides = guides.slice(1);
  const featuredReview = reviews[0];

  return (
    <main>
      {/* 1 — THE dominant element. One photo, one line, one action. */}
      <section className="relative min-h-[86vh]">
        <SmartImage
          src="/img/hero.jpg"
          alt="Trekkers crossing a high pass at golden hour, Khumbu"
          width={2000}
          height={860}
          eager
          cover
          className="absolute inset-0 h-full w-full"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-6xl px-4 pb-14">
            <h1 className="display-hero max-w-[13ch] font-display text-[13vw] text-white sm:text-7xl lg:text-8xl">
              <span className="wt-heavy">Pick your guide,</span>{" "}
              <span className="wt-light text-white/85">not your agency.</span>
            </h1>
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <Link
                to="/match"
                prefetch="intent"
                className="bg-chartreuse px-7 py-3.5 font-medium text-pine hover:bg-white"
              >
                {copy.home.ctaMatch}
              </Link>
              <Link
                to="/guides"
                prefetch="intent"
                className="font-medium text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
              >
                or meet all our guides →
              </Link>
            </div>
          </div>
        </div>
        {/* fingerprint: a real caption, not decoration */}
        <p className="absolute bottom-3 right-4 hidden font-mono text-[11px] text-white/60 sm:block">
          near Kongma La, 5,535 m · October · photo from Pemba's group
        </p>
      </section>

      {/* 2 — Featured guide. Asymmetric, photo bleeds, name overlaps the image. */}
      {featured && (
        <section className="mx-auto max-w-6xl px-4 pb-4 pt-20">
          <p className="label text-muted">The product is a person</p>
          <div className="mt-4 grid items-end gap-0 sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <Link to={`/guides/${featured.slug}`} className="relative block">
              <SmartImage
                src={featured.avatar_url ?? ""}
                alt={featured.full_name}
                width={640}
                height={800}
                className="aspect-[3/4] w-full"
              />
              {/* name breaks out of the photo's edge — deliberate collision */}
              <h2 className="display-hero absolute -right-4 bottom-6 z-20 font-display text-5xl text-white [text-shadow:0_1px_18px_rgb(0_0_0/0.45)] sm:-right-16 sm:text-6xl">
                <span className="wt-heavy">{featured.full_name.split(" ")[0]}</span>
                <span className="wt-light">&nbsp;{featured.full_name.split(" ").slice(1).join(" ")}</span>
              </h2>
            </Link>
            <div className="relative z-10 bg-paper p-6 sm:-ml-6 sm:mb-10 sm:border sm:border-line sm:p-8">
              <div className="flex items-center gap-2">
                <TierBadge tier={featured.tier} />
                {ratings[featured.user_id] && (
                  <Stars value={ratings[featured.user_id].value} count={ratings[featured.user_id].count} />
                )}
              </div>
              <p className="mt-3 max-w-[48ch] text-lg leading-relaxed text-ink">
                “{featured.bio ?? featured.hook_line}”
              </p>
              <p className="mt-3 font-mono text-sm text-ink-soft">
                {featured.years_experience} years on the trail · {featured.treks_completed_platform}{" "}
                treks led · {featured.home_district}
              </p>
              <Link
                to={`/guides/${featured.slug}`}
                className="mt-5 inline-block border border-ink px-5 py-2.5 text-sm font-medium text-ink hover:bg-ink hover:text-paper"
              >
                Meet {featured.full_name.split(" ")[0]} →
              </Link>
            </div>
          </div>

          {/* the rest, quieter, in one tight row */}
          <div className="-mx-4 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-pl-4 px-4 pb-2">
            {restGuides.map((g) => (
              <div key={g.user_id} className="flex w-52 shrink-0 snap-start">
                <GuideCard guide={g} rating={ratings[g.user_id]} languages={languagesByGuide[g.user_id]} />
              </div>
            ))}
            <Link
              to="/guides"
              className="flex w-52 shrink-0 snap-start items-center justify-center border border-dashed border-line text-sm font-medium text-primary hover:bg-mist"
            >
              All guides →
            </Link>
          </div>
        </section>
      )}

      {/* 3 — The Split, huge, on confident green. Only Trek has this section. */}
      {splitOffering?.price_breakdown && (
        <GiantSplit offering={splitOffering as PublicOffering} />
      )}

      {/* 4 — Things to do (real photos carry it now) */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-3xl text-ink">Things to do</h2>
          <Link to="/experiences" prefetch="intent" className="text-sm font-medium text-primary hover:underline">
            Browse all →
          </Link>
        </div>
        <div className="mb-5 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.kind}
              onClick={() => setCat(c.kind)}
              className={
                "px-4 py-1.5 text-sm transition-colors " +
                (cat === c.kind
                  ? "bg-pine text-paper"
                  : "border border-line bg-card text-ink hover:bg-mist")
              }
            >
              {c.label}
            </button>
          ))}
        </div>
        {shown.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {shown.map((o) => (
              <OfferingCard key={o.id} offering={o} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-soft">Nothing here yet in this category.</p>
        )}
      </section>

      {/* 5 — One review, big, half over the photo. Not a testimonial grid. */}
      {featuredReview && (
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
              <Stars value={featuredReview.overall} />
              <blockquote className="mt-3 text-xl leading-relaxed text-ink">
                “{featuredReview.body}”
              </blockquote>
              <figcaption className="mt-4 font-mono text-sm text-ink-soft">
                — {featuredReview.author_name}
                {featuredReview.author_country ? `, ${featuredReview.author_country}` : ""} ·{" "}
                {new Date(featuredReview.published_at).toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </figcaption>
            </figure>
          </div>
          <p className="mx-auto mt-3 max-w-6xl px-4 pb-2 text-right font-mono text-[11px] text-ink-soft">
            third lake, Gokyo, 4,790 m
          </p>
        </section>
      )}

      {/* 6 — Trust, one quiet line. The pages carry the detail. */}
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
                "group flex-1 py-5 pr-6 " + (i > 0 ? "border-t border-line sm:border-l sm:border-t-0 sm:pl-6" : "")
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

        {/* the bar — proportional, edge to edge */}
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
            <div key={l.key} className="flex items-baseline justify-between border-b border-paper/15 pb-2">
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
