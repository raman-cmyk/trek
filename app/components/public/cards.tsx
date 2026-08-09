import { Link } from "react-router";
import { SmartImage } from "~/components/SmartImage";
import { formatUsd } from "~/lib/pricing";
import { GuideChip, ResponseChip, Stars, TierBadge } from "./bits";

export interface PublicGuide {
  user_id: string;
  slug: string;
  full_name: string;
  avatar_url: string | null;
  home_district: string | null;
  tier: number;
  hook_line: string | null;
  day_rate_usd_cents: number | null;
  median_response_mins: number | null;
}

export interface PublicOffering {
  id: string;
  slug: string;
  kind: string;
  title: string;
  summary: string;
  days: number;
  price_usd_cents: number | null;
  cover_photo_url: string | null;
  guide_slug: string;
  guide_name: string;
  guide_avatar_url: string | null;
  guide_tier: number;
  guide_day_rate_usd_cents: number | null;
}

const KIND_LABEL: Record<string, string> = {
  trek: "Trek",
  day_hike: "Day hike",
  food_culture: "Food & culture",
  adventure: "Adventure",
  city: "City",
};

export function offeringPath(o: { kind: string; slug: string }) {
  return o.kind === "trek" ? `/treks/${o.slug}` : `/experiences/${o.slug}`;
}

export function offeringFromUsdCents(o: PublicOffering): number | null {
  if (o.kind === "trek") {
    return o.guide_day_rate_usd_cents
      ? o.guide_day_rate_usd_cents * o.days
      : null;
  }
  return o.price_usd_cents;
}

export function GuideCard({
  guide,
  rating,
  languages,
}: {
  guide: PublicGuide;
  rating?: { value: number; count: number };
  languages?: string[];
}) {
  return (
    <Link
      to={`/guides/${guide.slug}`}
      prefetch="intent"
      className="group block overflow-hidden rounded-card bg-card shadow-card transition-transform duration-instant ease-out-soft hover:-translate-y-0.5 hover:shadow-lift"
    >
      <SmartImage
        src={guide.avatar_url ?? ""}
        alt={`${guide.full_name}, trekking guide in ${guide.home_district ?? "Nepal"}`}
        width={300}
        height={400}
        avgColor="#c9c4be"
        className="aspect-[3/4] w-full"
      />
      <div className="space-y-1.5 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-ink">{guide.full_name}</p>
          <TierBadge tier={guide.tier} />
        </div>
        {guide.home_district && (
          <p className="text-xs text-ink-soft">{guide.home_district}</p>
        )}
        {guide.hook_line && (
          <p className="line-clamp-2 text-sm text-ink">{guide.hook_line}</p>
        )}
        <div className="flex items-center justify-between pt-0.5">
          {rating ? <Stars value={rating.value} count={rating.count} /> : <span />}
          {guide.day_rate_usd_cents && (
            <span className="text-sm">
              <span className="text-ink-soft">from </span>
              <span className="font-medium">
                {formatUsd(guide.day_rate_usd_cents)}
              </span>
              <span className="text-ink-soft">/day</span>
            </span>
          )}
        </div>
        {languages && languages.length > 0 && (
          <p className="truncate text-xs text-ink-soft">
            {languages.join(" · ")}
          </p>
        )}
        <ResponseChip mins={guide.median_response_mins} />
      </div>
    </Link>
  );
}

export function OfferingCard({ offering }: { offering: PublicOffering }) {
  const from = offeringFromUsdCents(offering);
  return (
    <Link
      to={offeringPath(offering)}
      prefetch="intent"
      className="group block overflow-hidden rounded-card bg-card shadow-card transition-transform duration-instant ease-out-soft hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="relative">
        <SmartImage
          src={offering.cover_photo_url ?? ""}
          alt={offering.title}
          width={400}
          height={300}
          avgColor="#b9b3ab"
          className="aspect-[4/3] w-full"
        />
        <span className="absolute left-2 top-2 rounded-pill bg-card/90 px-2 py-0.5 text-xs font-medium text-ink backdrop-blur">
          {KIND_LABEL[offering.kind] ?? offering.kind}
        </span>
        {/* GuideChip overlapping the photo edge — the signature element. */}
        <div className="absolute -bottom-3 left-3">
          <GuideChip
            slug={offering.guide_slug}
            name={offering.guide_name}
            avatarUrl={offering.guide_avatar_url}
            tier={offering.guide_tier}
            overlap
          />
        </div>
      </div>
      <div className="space-y-1 p-3 pt-5">
        <p className="line-clamp-1 font-medium text-ink">{offering.title}</p>
        <p className="text-xs text-ink-soft">
          {offering.kind === "trek"
            ? `${offering.days} days`
            : "Day experience"}
        </p>
        {from != null && (
          <p className="text-sm">
            <span className="text-ink-soft">from </span>
            <span className="font-medium">{formatUsd(from)}</span>
            {offering.kind !== "trek" && (
              <span className="text-ink-soft"> / person</span>
            )}
          </p>
        )}
      </div>
    </Link>
  );
}
