import { Link } from "react-router";
import { SmartImage } from "~/components/SmartImage";
import { type PriceBreakdown } from "~/lib/experience-pricing";
import { fromPriceFor } from "~/lib/card-offering";
import { useMoney } from "~/lib/currency-context";
import { GuideChip, OnlyWithMe, ResponseChip, Stars, TierBadge } from "./bits";
import { activityLevel, transportLabels } from "~/lib/offering-details";
import { partyWords } from "~/lib/party";

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
  summary?: string;
  days: number;
  price_usd_cents?: number | null;
  price_breakdown?: PriceBreakdown | null;
  max_party?: number | null;
  min_party?: number | null;
  /** Codes from 0066 — "On foot", "Private vehicle". */
  transport?: string[] | null;
  activity_level?: string | null;
  /** The from-price, computed by the loader so the breakdown need not travel. */
  from_usd_cents?: number | null;
  cover_photo_url: string | null;
  guide_slug: string;
  guide_name: string;
  guide_avatar_url: string | null;
  guide_tier: number;
  guide_day_rate_usd_cents: number | null;
  route_slug?: string | null;
  route_name?: string | null;
  /** Selected only where they are displayed — the compare table. */
  included?: string[] | null;
  meeting_point?: string | null;
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
  // Worked out on the server where it can be — a browse page that ships 56
  // price_breakdown objects so the browser can recompute 56 numbers is 8 KB
  // of payload for arithmetic already done (see app/lib/card-offering.ts).
  if (o.from_usd_cents != null) return o.from_usd_cents;
  return fromPriceFor(o);
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
      <div className="flex flex-1 flex-col p-3.5">
        {/* Her words lead — bold, no quotation marks, the way she said it.
            The name follows big, because by then you want to know whose
            promise that was. */}
        {(guide.only_with_me ?? guide.hook_line) && (
          <p className="line-clamp-3 font-display text-[17px] leading-snug text-ink">
            {guide.only_with_me ?? guide.hook_line}
          </p>
        )}
        {/* One line at card widths that fit it; stacked on the narrow
            two-up mobile grid, where a 2xl name beside a district truncated
            to a single letter. */}
        <div className="mt-2.5 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
          <p className="truncate font-display text-xl text-ink sm:text-2xl">
            {guide.full_name}
          </p>
          {guide.home_district && (
            <p className="flex shrink-0 items-center gap-1 text-sm text-muted">
              <PinMark />
              {guide.home_district}
            </p>
          )}
        </div>
        {rating && rating.count > 0 && (
          <div className="mt-1.5">
            <Stars value={rating.value} count={rating.count} />
          </div>
        )}
        {/* Bottom row pinned so every card in a row is equal height (§8). */}
        <div className="mt-auto flex items-baseline justify-between gap-2 pt-2">
          {rating && rating.count > 0 ? (
            <span className="truncate text-sm text-muted">
              {languages && languages.length > 0 ? languages.slice(0, 3).join(", ") : ""}
            </span>
          ) : (
            <span className="text-sm text-muted">Be the first</span>
          )}
          {guide.day_rate_usd_cents && (
            <span className="shrink-0 text-sm text-muted">
              <span className="font-mono font-medium text-ink">
                {mr(guide.day_rate_usd_cents)}
              </span>
              /day
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function OfferingCard({
  offering,
  rating,
}: {
  offering: PublicOffering;
  /** This trip's own reviews. Every card we are compared with shows one. */
  rating?: { value: number; count: number } | null;
}) {
  const { mr } = useMoney();
  const from = offeringFromUsdCents(offering);
  const transport = transportLabels(offering.transport).slice(0, 2);
  const level = activityLevel(offering.activity_level);
  return (
    // Not a <Link> wrapper: the route chip below has to be its own link, and a
    // nested <a> is invalid HTML that breaks hydration. Instead the title link
    // stretches an invisible ::after over the whole card, so the card is still
    // one big tap target and the chip still wins where it sits.
    <div className="group relative flex h-full flex-col overflow-hidden rounded-md border border-line bg-card shadow-card transition duration-instant ease-out-soft hover:-translate-y-0.5 hover:border-sage hover:shadow-lift">
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
        <Link
          to={offeringPath(offering)}
          prefetch="intent"
          className="title line-clamp-2 font-medium text-ink after:absolute after:inset-0 after:content-['']"
        >
          {offering.title}
        </Link>

        {/* The rating of this trip, not of its guide. A card with no number on
            it reads as "nobody has been", which on a trip with five reviews
            costs the guide the booking. */}
        {rating && rating.count > 0 ? (
          <Stars value={rating.value} count={rating.count} />
        ) : (
          <p className="text-caption text-muted">No reviews yet</p>
        )}

        {/* How long, how you move, how many of you. These are the three facts
            every card we are compared with carries and ours did not: a reader
            scanning a grid was choosing on a photograph and a price. */}
        <ul className="mt-0.5 space-y-0.5 text-caption text-ink-soft">
          <li className="flex items-center gap-1.5">
            <FactIcon id="clock" />
            <span>
              {offering.kind === "trek" ? (
                <>
                  <span className="font-mono text-ink">{offering.days}</span> days
                </>
              ) : (
                "One day"
              )}
              {level && <span className="text-muted"> · {level.label}</span>}
            </span>
          </li>
          {transport.length > 0 && (
            <li className="flex items-center gap-1.5">
              <FactIcon id="van" />
              <span>{transport.join(" · ")}</span>
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <FactIcon id="people" />
            <span>{partyWords(offering.min_party ?? 1, offering.max_party ?? null)}</span>
          </li>
        </ul>

        {offering.route_slug && (
          <p className="text-caption text-muted">
            <Link
              to={`/routes/${offering.route_slug}`}
              prefetch="intent"
              className="relative z-10 text-moss underline decoration-sage underline-offset-2 hover:decoration-moss"
            >
              {offering.route_name}
            </Link>
          </p>
        )}

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
    </div>
  );
}

/*
 * The three marks on a card's fact list, drawn from the sprite the public
 * layout renders once (CardIconSprite below).
 *
 * They were inline SVGs: 168 of them on the browse page, about 34 KB of
 * markup for three shapes. A <use> reference is a third of the size and the
 * shape is parsed once.
 */
function FactIcon({ id }: { id: "clock" | "van" | "people" }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      className="shrink-0 text-muted"
      aria-hidden="true"
    >
      <use href={`#gi-${id}`} />
    </svg>
  );
}

/**
 * The shapes themselves, rendered once per document by the public layout.
 *
 * Hidden rather than sized to zero: a 0×0 SVG still takes part in layout in
 * some browsers, and this must never nudge the page.
 */
export function CardIconSprite() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ display: "none" }}>
      <symbol id="gi-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </symbol>
      <symbol id="gi-van" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 16V8h11l4 4h3v4" />
        <circle cx="7" cy="17" r="1.6" />
        <circle cx="17" cy="17" r="1.6" />
      </symbol>
      <symbol id="gi-people" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
        <path d="M16 11a3 3 0 100-6" />
        <path d="M18 20c0-2-.7-3.4-2-4.3" />
      </symbol>
    </svg>
  );
}

/** The little red pin beside a district — the one warm mark on the card. */
function PinMark() {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" fill="none" aria-hidden="true" className="shrink-0">
      <path
        d="M6 13.2S11 8.3 11 5.1A5 5 0 0 0 1 5.1C1 8.3 6 13.2 6 13.2z"
        fill="var(--color-ember)"
      />
      <circle cx="6" cy="5" r="1.7" fill="var(--color-paper)" />
    </svg>
  );
}
