import { Link } from "react-router";
import type { OfferingDetailData } from "~/features/offering-detail.server";
import { SmartImage } from "~/components/SmartImage";
import { Carousel, type Photo } from "~/components/public/Carousel";
import { BookingWidget } from "~/components/public/BookingWidget";
import { ReviewBlock, Stars, TierBadge } from "~/components/public/bits";

export function OfferingDetailView({ data }: { data: OfferingDetailData }) {
  const { o, photos, availableDays, reviews, rating, permitPp } = data;
  const carousel: Photo[] = (
    photos.length
      ? photos
      : [{ url: o.cover_photo_url ?? "", alt_text: o.title, credit_name: null }]
  ).map((p) => ({ url: p.url, alt: p.alt_text, credit: p.credit_name }));
  const itinerary: Array<{
    day?: number;
    time?: string;
    title: string;
    body?: string;
  }> = Array.isArray(o.itinerary) ? o.itinerary : [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 pb-24 lg:pb-6">
      <Carousel photos={carousel} />

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <header>
            <h1 className="font-display text-3xl text-ink">{o.title}</h1>
            <p className="mt-1 text-sm text-ink-soft">
              {o.kind === "trek" ? `${o.days} days` : "Day experience"}
              {o.max_party ? ` · up to ${o.max_party} people` : ""}
            </p>
          </header>

          {/* Guide block — the product, above the fold */}
          <Link
            to={`/guides/${o.guide_slug}`}
            prefetch="intent"
            className="flex items-center gap-4 rounded-card border border-border p-4 hover:shadow-card"
          >
            <SmartImage
              src={o.guide_avatar_url ?? ""}
              alt={o.guide_name}
              width={64}
              height={64}
              avgColor="#d6d3d1"
              className="h-16 w-16 rounded-full"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-ink">Led by {o.guide_name}</p>
                <TierBadge tier={o.guide_tier} />
              </div>
              {rating && <Stars value={rating.value} count={rating.count} />}
              <p className="text-sm text-primary">Full profile →</p>
            </div>
          </Link>

          <section>
            <p className="text-ink">{o.summary}</p>
          </section>

          {itinerary.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-xl">
                {o.kind === "trek" ? "Itinerary" : "What you'll do"}
              </h2>
              <ol className="space-y-2">
                {itinerary.map((it, i) => (
                  <li key={i} className="rounded-card border border-border p-3">
                    <p className="text-sm font-medium text-ink">
                      {it.day != null ? `Day ${it.day}` : it.time} · {it.title}
                    </p>
                    {it.body && (
                      <p className="mt-1 text-sm text-ink-soft">{it.body}</p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {(o.included?.length || o.excluded?.length) && (
            <section className="grid gap-6 sm:grid-cols-2">
              {o.included?.length ? (
                <div>
                  <h3 className="mb-2 font-medium">What's included</h3>
                  <ul className="space-y-1 text-sm text-ink">
                    {o.included.map((x: string) => (
                      <li key={x} className="flex gap-2">
                        <span className="text-accent">✓</span>
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {o.excluded?.length ? (
                <div>
                  <h3 className="mb-2 font-medium">Not included</h3>
                  <ul className="space-y-1 text-sm text-ink-soft">
                    {o.excluded.map((x: string) => (
                      <li key={x} className="flex gap-2">
                        <span>✕</span>
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          )}

          {o.meeting_point && (
            <section>
              <h3 className="mb-1 font-medium">Meeting point</h3>
              <p className="text-sm text-ink-soft">{o.meeting_point}</p>
            </section>
          )}

          {reviews.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-display text-xl">Reviews</h2>
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

        <BookingWidget
          offering={{
            id: o.id,
            guide_id: o.guide_id,
            kind: o.kind,
            days: o.days,
            price_usd_cents: o.price_usd_cents,
            min_party: o.min_party,
            max_party: o.max_party,
            guide_day_rate_usd_cents: o.guide_day_rate_usd_cents,
            permit_fees_pp_usd_cents: permitPp,
            guide_first_name: o.guide_name.split(" ")[0],
          }}
          availableDays={availableDays}
          returnTo={data.canonical ? new URL(data.canonical).pathname : "/"}
        />
      </div>
    </main>
  );
}
