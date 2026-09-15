import { Link } from "react-router";
import { SmartImage } from "~/components/SmartImage";
import { fromPerPersonUsdCents, type PriceBreakdown , hasBreakdown } from "~/lib/experience-pricing";
import { useMoney } from "~/lib/currency-context";
import { listPriceUsdCents } from "~/lib/list-price";
import { GuideChip, OnlyWithMe, ResponseChip, Stars, TierBadge } from "./bits";
import { Fallback } from "~/components/design/Fallback";
import { GlassPill } from "~/components/design/Glass";
import { Glyph, type ChipGlyph } from "~/components/design/Chip";

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

/** The glyph each kind carries on its chip and in its empty state. */
export const KIND_GLYPH: Record<string, ChipGlyph> = {
  trek: "mountain",
  day_hike: "walk",
  food_culture: "spark",
  adventure: "tent",
  city: "city",
};

function responseLabel(mins: number): string {
  if (mins < 60) return `~${mins} min`;
  const h = Math.round(mins / 60);
  return `~${h} hr`;
}

export function offeringPath(o: { kind: string; slug: string }) {
  return o.kind === "trek" ? `/treks/${o.slug}` : `/experiences/${o.slug}`;
}

export function offeringFromUsdCents(o: PublicOffering): number | null {
  // The figure the trip page will quote when somebody lands on it.
  //
  // This used to price the guide fee split four ways while the page opens at
  // the party the trip allows — usually one. On Pemba's Everest trek that is
  // a $630 guide fee advertised as $157 and charged as $630: a card price
  // nobody could buy. app/lib/list-price.ts is now the single definition and
  // the page reads the same arithmetic.
  return listPriceUsdCents(o);
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
      className="group flex h-full flex-col overflow-hidden rounded-photo border border-line bg-card shadow-card transition duration-instant ease-out-soft hover:-translate-y-0.5 hover:border-sage hover:shadow-lift"
    >
      {/* The photograph carries the card (docs/07). Without one, the contour
          pattern and the guide's initial — never a blank tan box, which is
          what most of this grid used to be. */}
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-wheat">
        {guide.avatar_url ? (
          <SmartImage
            src={guide.avatar_url}
            alt={`${guide.full_name}, trekking guide in ${guide.home_district ?? "Nepal"}`}
            width={300}
            height={375}
            cover
            className="absolute inset-0 h-full w-full"
            imgClassName="transition duration-slow group-hover:scale-[1.03]"
          />
        ) : (
          <Fallback initial={guide.full_name} />
        )}
        {/* Tier on a glass pill, top-right (§8); how fast they answer, bottom-left. */}
        <div className="absolute right-2 top-2">
          <TierBadge tier={guide.tier} static />
        </div>
        {guide.median_response_mins ? (
          <GlassPill className="absolute bottom-2 left-2">
            <Glyph name="clock" className="text-moss" />
            <span className="font-mono">{responseLabel(guide.median_response_mins)}</span>
          </GlassPill>
        ) : null}
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
        {/* Stacked at every width: beside the district the name truncated to
            "Pemb…" on a four-up grid, and a guide's name is the one thing on
            the card that must never be cut. */}
        <div className="mt-2.5 flex flex-col gap-0.5">
          <p className="font-display text-xl leading-tight text-ink sm:text-2xl">
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

export function OfferingCard({ offering }: { offering: PublicOffering }) {
  const { mr } = useMoney();
  const from = offeringFromUsdCents(offering);
  return (
    // Not a <Link> wrapper: the route chip below has to be its own link, and a
    // nested <a> is invalid HTML that breaks hydration. Instead the title link
    // stretches an invisible ::after over the whole card, so the card is still
    // one big tap target and the chip still wins where it sits.
    <div className="group relative flex h-full flex-col overflow-hidden rounded-photo border border-line bg-card shadow-card transition duration-instant ease-out-soft hover:-translate-y-0.5 hover:border-sage hover:shadow-lift">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-wheat">
        {offering.cover_photo_url ? (
          <SmartImage
            src={offering.cover_photo_url}
            alt={offering.title}
            width={400}
            height={300}
            cover
            className="absolute inset-0 h-full w-full"
            imgClassName="transition duration-slow group-hover:scale-[1.03]"
          />
        ) : (
          <Fallback glyph={KIND_GLYPH[offering.kind] ?? "mountain"} />
        )}
        {/* What kind of trip, on a glass pill top-left; the price top-right,
            so the two questions a grid is scanned for are answered on the
            picture (docs/07). */}
        <GlassPill className="absolute left-2 top-2 uppercase tracking-wide">
          <Glyph name={KIND_GLYPH[offering.kind] ?? "mountain"} className="text-moss" />
          <span className="text-[11px] font-semibold">{KIND_LABEL[offering.kind] ?? offering.kind}</span>
        </GlassPill>
        {from != null && (
          <GlassPill className="absolute right-2 top-2">
            {/* No "from". It is the price this trip quotes for the party it
                opens with; a group splits the guide fee and the trip page
                shows that next to the control that does it. Promising a
                floor on the card and a bigger number one click later is the
                bug this replaced. */}
            <span className="font-mono font-semibold">{mr(from)}</span>
          </GlassPill>
        )}
      </div>

      {/* Guide chip — first name — overlapping the photo edge (§8).
          The full name was truncating to "Aakash K…" in a 165px card on a
          phone, which is worse than the first name it was trying to improve
          on. The face and the first name are the identity here; the full
          name is on the page this card links to.
          It used to be `absolute -bottom-3` INSIDE the image wrapper, which
          is `overflow-hidden` for the rounded corners and the hover zoom. So
          the bottom twelve pixels of a forty-pixel pill were sliced off on
          every card on the site — the guide's name cut through the middle,
          on the one element whose whole job is to say a real person runs
          this. Out of the clipping box and pulled up by a margin instead.

          Static: the whole card is already a link, and a nested <a> is
          invalid HTML that breaks hydration. Tapping the chip opens the trip,
          which is the right destination from here anyway. */}
      <div className="relative z-10 -mt-3 ml-3 mr-3 max-w-[calc(100%-1.5rem)]">
        <GuideChip
          slug={offering.guide_slug}
          name={offering.guide_name}
          avatarUrl={offering.guide_avatar_url}
          tier={offering.guide_tier}
          overlap
          static
        />
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3 pt-2">
        <Link
          to={offeringPath(offering)}
          prefetch="intent"
          className="title line-clamp-2 font-medium text-ink after:absolute after:inset-0 after:content-['']"
        >
          {offering.title}
        </Link>
        <p className="text-caption text-muted">
          {offering.kind === "trek" ? (
            <>
              <span className="font-mono text-ink">{offering.days}</span> days
            </>
          ) : (
            "Day experience"
          )}
          {offering.route_slug && (
            <>
              {" · "}
              <Link
                to={`/routes/${offering.route_slug}`}
                prefetch="intent"
                className="relative z-10 text-moss underline decoration-sage underline-offset-2 hover:decoration-moss"
              >
                {offering.route_name}
              </Link>
            </>
          )}
        </p>
        {from != null && (
          // "per person" completes the pill on the photograph; the number is
          // up there, where a grid is scanned.
          <p className="mt-auto pt-1 text-caption text-muted">
            per person{(offering.max_party ?? 1) > 1 ? " · less in a group" : ""}
          </p>
        )}
      </div>
    </div>
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
