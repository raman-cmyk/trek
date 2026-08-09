import { Link } from "react-router";
import type { Route } from "./+types/guides.$slug";
import { pageMeta, personLd, breadcrumbLd, jsonLd, absoluteUrl } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { guideRatings } from "~/lib/ratings.server";
import { Carousel, type Photo } from "~/components/public/Carousel";
import { AvailabilityCalendar } from "~/components/public/AvailabilityCalendar";
import { OfferingCard, type PublicOffering } from "~/components/public/cards";
import { ReviewBlock, ResponseChip, Stars, TierBadge } from "~/components/public/bits";

// Plain-English checklist shown per tier (actual verification rows are ops-only).
const TIER_CHECKS: Record<number, string[]> = {
  1: ["Trekking licence verified", "Government ID matched", "Phone verified"],
  2: [
    "Trekking licence verified",
    "Government ID matched",
    "Phone verified",
    "Two references called",
    "Wilderness first-aid current",
  ],
  3: [
    "Trekking licence verified",
    "Government ID matched",
    "Phone verified",
    "Two references called",
    "Wilderness first-aid current",
    "Police clearance",
    "Altitude training",
  ],
};

export function meta({ loaderData: data }: Route.MetaArgs) {
  if (!data) return [{ title: "Guide not found" }];
  const g = data.guide;
  return [
    ...pageMeta({
      title: `${g.full_name} — trekking guide${g.home_district ? `, ${g.home_district}` : ""}`,
      description: g.hook_line ?? `Book ${g.full_name}, a verified trekking guide in Nepal.`,
      canonical: data.canonical,
      image: g.avatar_url ?? undefined,
      type: "profile",
    }),
    jsonLd(
      personLd({
        name: g.full_name,
        url: data.canonical,
        image: g.avatar_url,
        district: g.home_district,
        bio: g.bio,
        rating: data.rating,
      }),
    ),
    jsonLd(
      breadcrumbLd([
        { name: "Guides", url: new URL(data.canonical).origin + "/guides" },
        { name: g.full_name, url: data.canonical },
      ]),
    ),
  ];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);

  const { data: guide } = await client
    .from("public_guides")
    .select("*")
    .eq("slug", params.slug)
    .single();
  if (!guide) throw new Response("Guide not found", { status: 404 });

  const today = new Date();
  const monthAnchor = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const todayIso = today.toISOString().slice(0, 10);

  const [{ data: photos }, { data: langs }, { data: offerings }, { data: avail }, { data: reviews }] =
    await Promise.all([
      client
        .from("guide_photos")
        .select("url, alt_text, kind")
        .eq("guide_id", guide.user_id)
        .order("sort"),
      client.from("guide_languages").select("language, proficiency").eq("guide_id", guide.user_id),
      client
        .from("public_offerings")
        .select(
          "id, slug, kind, title, summary, days, price_usd_cents, cover_photo_url, guide_slug, guide_name, guide_avatar_url, guide_tier, guide_day_rate_usd_cents",
        )
        .eq("guide_id", guide.user_id),
      client
        .from("availability")
        .select("day")
        .eq("guide_id", guide.user_id)
        .eq("status", "open")
        .gte("day", todayIso)
        .order("day"),
      client
        .from("public_reviews")
        .select("id, overall, body, published_at, author_name, author_country")
        .eq("guide_id", guide.user_id)
        .order("published_at", { ascending: false }),
    ]);

  const ratings = await guideRatings(client, [guide.user_id]);

  return {
    guide,
    photos: (photos ?? []) as Array<{ url: string; alt_text: string; kind: string }>,
    languages: (langs ?? []) as Array<{ language: string; proficiency: string }>,
    offerings: (offerings ?? []) as PublicOffering[],
    openDays: (avail ?? []).map((a: { day: string }) => a.day),
    reviews: reviews ?? [],
    rating: ratings[guide.user_id] ?? null,
    monthAnchor,
    canonical: absoluteUrl(env.SITE_URL, `/guides/${params.slug}`),
  };
}

export default function GuideProfile({ loaderData }: Route.ComponentProps) {
  const { guide, photos, languages, offerings, openDays, reviews, rating, monthAnchor } =
    loaderData;
  const carousel: Photo[] = (photos.length
    ? photos
    : [{ url: guide.avatar_url ?? "", alt_text: guide.full_name, kind: "headshot" }]
  ).map((p) => ({ url: p.url, alt: p.alt_text, avgColor: "#c9c4be" }));
  const checks = TIER_CHECKS[guide.tier] ?? TIER_CHECKS[1];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 pb-24 lg:pb-6">
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          <Carousel photos={carousel} aspect="4/3" />

          <header className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl text-ink">{guide.full_name}</h1>
              <TierBadge tier={guide.tier} />
            </div>
            <p className="text-ink-soft">{guide.home_district}, Nepal</p>
            <div className="flex flex-wrap items-center gap-3">
              {rating && <Stars value={rating.value} count={rating.count} />}
              <ResponseChip mins={guide.median_response_mins} />
            </div>
          </header>

          {guide.bio && (
            <section>
              <p className="whitespace-pre-line text-ink">{guide.bio}</p>
            </section>
          )}

          {/* Stats row */}
          <section className="flex flex-wrap gap-6 border-y border-border py-4 text-sm">
            <Stat label="Years guiding" value={guide.years_experience ?? "—"} />
            <Stat label="Treks on Trek" value={guide.treks_completed_platform} />
            {languages.length > 0 && (
              <Stat
                label="Languages"
                value={languages.map((l) => l.language).join(", ")}
              />
            )}
          </section>

          {/* TrustExpander — what we checked */}
          <section>
            <details className="group rounded-card border border-border p-4">
              <summary className="cursor-pointer font-medium text-ink">
                What we checked
              </summary>
              <ul className="mt-3 space-y-1.5 text-sm">
                {checks.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span className="text-accent">✓</span>
                    {c}
                  </li>
                ))}
              </ul>
            </details>
          </section>

          {offerings.length > 0 && (
            <section>
              <h2 className="mb-4 font-display text-2xl">
                {guide.full_name.split(" ")[0]}’s treks & experiences
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {offerings.map((o) => (
                  <OfferingCard key={o.id} offering={o} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-4 font-display text-2xl">Availability</h2>
            <AvailabilityCalendar openDays={openDays} monthsFrom={monthAnchor} />
          </section>

          {reviews.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-display text-2xl">Reviews</h2>
              {reviews.map((r) => (
                <ReviewBlock
                  key={r.id}
                  authorName={r.author_name}
                  country={r.author_country}
                  overall={r.overall}
                  body={r.body}
                  date={r.published_at}
                />
              ))}
            </section>
          )}
        </div>

        {/* Desktop side rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-3 rounded-card border border-border bg-card p-5 shadow-card">
            <p className="text-sm text-ink-soft">
              {guide.day_rate_usd_cents ? "From" : ""}{" "}
              <span className="text-xl font-medium text-ink">
                {guide.day_rate_usd_cents
                  ? `$${(guide.day_rate_usd_cents / 100).toFixed(0)}/day`
                  : ""}
              </span>
            </p>
            {offerings[0] && (
              <Link
                to={`/${offerings[0].kind === "trek" ? "treks" : "experiences"}/${offerings[0].slug}`}
                prefetch="intent"
                className="block rounded-button bg-primary px-4 py-3 text-center font-medium text-white hover:bg-primary-hover"
              >
                See {guide.full_name.split(" ")[0]}’s trips
              </Link>
            )}
          </div>
        </aside>
      </div>

      {/* Mobile sticky bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-border bg-card p-3 lg:hidden">
        <p className="flex-1 text-sm font-medium">
          {guide.day_rate_usd_cents
            ? `From $${(guide.day_rate_usd_cents / 100).toFixed(0)}/day`
            : guide.full_name}
        </p>
        {offerings[0] && (
          <Link
            to={`/${offerings[0].kind === "trek" ? "treks" : "experiences"}/${offerings[0].slug}`}
            className="rounded-button bg-primary px-4 py-2 font-medium text-white"
          >
            See trips
          </Link>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium text-ink">{value}</p>
      <p className="text-xs text-ink-soft">{label}</p>
    </div>
  );
}
