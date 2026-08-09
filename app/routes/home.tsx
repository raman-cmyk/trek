import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/home";
import { copy } from "~/lib/copy";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { guideRatings } from "~/lib/ratings.server";
import { GuideCard, OfferingCard, type PublicOffering } from "~/components/public/cards";
import { ReviewBlock } from "~/components/public/bits";
import { SmartImage } from "~/components/SmartImage";

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

  const [{ data: guides }, { data: offerings }, { data: reviews }, { data: trailPhotos }] =
    await Promise.all([
      client
        .from("public_guides")
        .select(
          "user_id, slug, full_name, avatar_url, home_district, tier, hook_line, day_rate_usd_cents, median_response_mins",
        )
        .order("tier", { ascending: false })
        .limit(8),
      client
        .from("public_offerings")
        .select(
          "id, slug, kind, title, summary, days, price_usd_cents, cover_photo_url, guide_slug, guide_name, guide_avatar_url, guide_tier, guide_day_rate_usd_cents",
        )
        .limit(24),
      client
        .from("public_reviews")
        .select("id, overall, body, published_at, author_name, author_country")
        .order("published_at", { ascending: false })
        .limit(6),
      client
        .from("offering_photos")
        .select("url, alt_text, credit_name")
        .eq("approved", true)
        .eq("source", "trekker")
        .limit(3),
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

  return {
    guides: guides ?? [],
    offerings: (offerings ?? []) as PublicOffering[],
    reviews: reviews ?? [],
    trailPhotos: trailPhotos ?? [],
    ratings,
    languagesByGuide,
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
  const { guides, offerings, reviews, trailPhotos, ratings, languagesByGuide } =
    loaderData;
  const [cat, setCat] = useState<string>("trek");
  const shown = offerings.filter((o) => o.kind === cat).slice(0, 6);

  return (
    <main>
      {/* 1 — Hero */}
      <section className="relative">
        <SmartImage
          src="https://img.example/home/hero.jpg"
          alt="A guide leading trekkers on a Himalayan trail at sunrise"
          width={1600}
          height={900}
          avgColor="#1e3a5f"
          eager
          className="h-[70vh] max-h-[560px] w-full"
        />
        <div className="absolute inset-0 flex items-center bg-gradient-to-t from-black/60 via-black/25 to-transparent">
          <div className="mx-auto w-full max-w-6xl px-4">
            <h1 className="max-w-2xl font-display text-4xl leading-tight text-white sm:text-5xl">
              {copy.brand.positioning}
            </h1>
            <p className="mt-3 max-w-xl text-lg text-white/90">
              Every trek and experience belongs to a specific, verified guide —
              a real human you choose, not an anonymous package.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/guides"
                prefetch="intent"
                className="rounded-button bg-primary px-5 py-3 font-medium text-white transition-colors hover:bg-primary-hover"
              >
                {copy.home.ctaFindGuide}
              </Link>
              <Link
                to="/experiences"
                prefetch="intent"
                className="rounded-button bg-white/95 px-5 py-3 font-medium text-ink transition-colors hover:bg-white"
              >
                {copy.home.ctaBrowse}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 2 — Meet your guides */}
      <Section title="Meet your guides" href="/guides" cta="See all guides">
        <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2">
          {guides.map((g) => (
            <div key={g.user_id} className="w-52 shrink-0 snap-start">
              <GuideCard
                guide={g}
                rating={ratings[g.user_id]}
                languages={languagesByGuide[g.user_id]}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* 3 — Things to do */}
      <Section title="Things to do" href="/experiences" cta="Browse all">
        <div className="mb-4 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.kind}
              onClick={() => setCat(c.kind)}
              className={
                "rounded-pill px-3 py-1.5 text-sm transition-colors " +
                (cat === c.kind
                  ? "bg-primary text-white"
                  : "bg-card text-ink hover:bg-black/5")
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
          <p className="text-sm text-ink-soft">
            Nothing here yet in this category.
          </p>
        )}
      </Section>

      {/* 4 — Trust strip */}
      <section className="bg-card">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:grid-cols-3">
          <TrustCol
            to="/safety"
            title={copy.trust.everyGuideVerified}
            body="Licence, ID, references and first-aid — checked, with dates you can see."
          />
          <TrustCol
            to="/transparency"
            title={copy.trust.transparentPricing}
            body="Guide fee, permits and our fee — itemised. Never a mystery total."
          />
          <TrustCol
            to="/safety"
            title={copy.trust.rescuePledge}
            body="We take nothing on rescue flights. Your safety is not our margin."
          />
        </div>
      </section>

      {/* 5 — On the trail right now (full check-in feed lands in M8) */}
      {trailPhotos.length > 0 && (
        <Section title="On the trail this season">
          <div className="grid grid-cols-3 gap-4">
            {trailPhotos.map((p, i) => (
              <figure key={i} className="overflow-hidden rounded-card">
                <SmartImage
                  src={p.url}
                  alt={p.alt_text}
                  width={400}
                  height={300}
                  avgColor="#8a8177"
                  className="aspect-[4/3] w-full"
                />
                {p.credit_name && (
                  <figcaption className="p-1 text-xs text-ink-soft">
                    {p.credit_name}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </Section>
      )}

      {/* 6 — How it works */}
      <Section title="How it works">
        <ol className="grid gap-6 sm:grid-cols-3">
          {[
            ["Pick your guide", "Browse real, verified guides and the treks they lead."],
            ["Request to book", "Send your dates. Your guide confirms, we handle permits."],
            ["Trek with a human", "Daily check-ins, transparent pricing, a person who cares."],
          ].map(([t, b], i) => (
            <li key={t} className="rounded-card bg-card p-5 shadow-card">
              <span className="font-display text-2xl text-primary">{i + 1}</span>
              <p className="mt-1 font-medium text-ink">{t}</p>
              <p className="mt-1 text-sm text-ink-soft">{b}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* 7 — Recent reviews */}
      {reviews.length > 0 && (
        <Section title="Recent reviews">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-card bg-card p-5 shadow-card">
                <ReviewBlock
                  authorName={r.author_name}
                  country={r.author_country}
                  overall={r.overall}
                  body={r.body}
                  date={r.published_at}
                />
              </div>
            ))}
          </div>
        </Section>
      )}
    </main>
  );
}

function Section({
  title,
  href,
  cta,
  children,
}: {
  title: string;
  href?: string;
  cta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="font-display text-2xl text-ink">{title}</h2>
        {href && cta && (
          <Link
            to={href}
            prefetch="intent"
            className="text-sm font-medium text-primary hover:underline"
          >
            {cta} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function TrustCol({
  to,
  title,
  body,
}: {
  to: string;
  title: string;
  body: string;
}) {
  return (
    <Link to={to} className="group">
      <p className="font-medium text-ink group-hover:text-primary">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{body}</p>
    </Link>
  );
}
