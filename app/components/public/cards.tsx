import { Link } from "react-router";
import { SmartImage } from "~/components/SmartImage";
import { fromPerPersonUsdCents, type PriceBreakdown } from "~/lib/experience-pricing";
import { useMoney } from "~/lib/currency-context";
import { GuideChip, OnlyWithMe, ResponseChip, Stars, TierBadge } from "./bits";

export interface PublicGuide {
  user_id: string;
  slug: string;
  full_name: string;
  avatar_url: string | null;
  home_district: string | null;
  tier: number;
  hook_line: string | null;
  only_with_me?: string | null;
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
  price_breakdown: PriceBreakdown | null;
  max_party?: number | null;
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
  // v3: an experience's price is its packaged breakdown total (cheapest per
  // person = largest sensible group), NOT day_rate × days.
  if (o.price_breakdown?.guide_fee_total_usd_cents) {
    return fromPerPersonUsdCents(o.price_breakdown, o.max_party ?? undefined);
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
  const { mr } = useMoney();
  return (
    <Link
      to={`/guides/${guide.slug}`}
      prefetch="intent"
      className="group flex h-full flex-col overflow-hidden rounded-md border border-line bg-card shadow-card transition duration-instant ease-out-soft hover:-translate-y-0.5 hover:border-sage hover:shadow-lift"
    >
      <div className="relative">
        <SmartImage
          src={guide.avatar_url ?? ""}
          alt={`${guide.full_name}, trekking guide in ${guide.home_district ?? "Nepal"}`}
          width={300}
          height={375}
          className="aspect-[4/5] w-full"
        />
        {/* Tier badge on a paper pill, top-right of the photo (§8). */}
        <div className="absolute right-2 top-2">
          <TierBadge tier={guide.tier} static />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="title font-medium text-ink">{guide.full_name}</p>
        {guide.home_district && (
          <p className="text-caption text-muted">{guide.home_district}</p>
        )}
        {/* The promise leads. The hook_line is a description of the guide;
            this is the guide talking, so it outranks it — and when a guide
            hasn't written one yet, the description still carries the card. */}
        {guide.only_with_me ? (
          <OnlyWithMe line={guide.only_with_me} />
        ) : (
          guide.hook_line && (
            <p className="line-clamp-2 text-sm text-ink">{guide.hook_line}</p>
          )
        )}
        {/* Bottom row pinned so every card in a row is equal height (§8). */}
        <div className="mt-auto flex items-center justify-between pt-1.5">
          <Stars value={rating?.value ?? 0} count={rating?.count} />
          {guide.day_rate_usd_cents && (
            <span className="text-sm text-muted">
              <span className="font-mono font-medium text-ink">
                {mr(guide.day_rate_usd_cents)}
              </span>
              /day
            </span>
          )}
        </div>
        {languages && languages.length > 0 && (
          <p className="truncate text-caption text-muted">
            {languages.join(" · ")}
          </p>
        )}
        <ResponseChip mins={guide.median_response_mins} />
      </div>
    </Link>
  );
}

export function OfferingCard({ offering }: { offering: PublicOffering }) {
  const { mr } = useMoney();
  const from = offeringFromUsdCents(offering);
  return (
    <Link
      to={offeringPath(offering)}
      prefetch="intent"
      className="group flex h-full flex-col overflow-hidden rounded-md border border-line bg-card shadow-card transition duration-instant ease-out-soft hover:-translate-y-0.5 hover:border-sage hover:shadow-lift"
    >
      <div className="relative">
        <SmartImage
          src={offering.cover_photo_url ?? ""}
          alt={offering.title}
          width={400}
          height={267}
          className="aspect-[3/2] w-full"
        />
        {/* Category tag: label style on a paper pill, top-left (§8). */}
        <span className="absolute left-2 top-2 rounded-full bg-paper/90 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink backdrop-blur">
          {KIND_LABEL[offering.kind] ?? offering.kind}
        </span>
        {/* Guide chip — full name — overlapping the photo edge (§8). Static:
            the whole card is already a link, and a nested <a> is invalid HTML
            that breaks hydration. Tapping the chip opens the trip, which is
            the right destination from here anyway. */}
        <div className="absolute -bottom-3 left-3">
          <GuideChip
            slug={offering.guide_slug}
            name={offering.guide_name}
            avatarUrl={offering.guide_avatar_url}
            tier={offering.guide_tier}
            overlap
            fullName
            static
          />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3 pt-5">
        <p className="title line-clamp-2 font-medium text-ink">{offering.title}</p>
        <p className="text-caption text-muted">
          {offering.kind === "trek" ? (
            <>
              <span className="font-mono text-ink">{offering.days}</span> days
            </>
          ) : (
            "Day experience"
          )}
        </p>
        {from != null && (
          // Consistent price format site-wide: "from $XX · per person" (§8).
          // Rounded — converted cents are FX noise in a grid; the breakdown on
          // the detail page is where "to the cent" is the point.
          <p className="mt-auto pt-1 text-sm text-muted">
            from{" "}
            <span className="font-mono font-medium text-ink">{mr(from)}</span>{" "}
            · per person
          </p>
        )}
      </div>
    </Link>
  );
}
