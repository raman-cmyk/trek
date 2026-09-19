import { Link } from "react-router";
import { OFFERING_KIND_LABEL, kindsLine } from "~/lib/offering-kinds";
import { ratingLine, reviewsLabel, starText, type CardRating } from "~/lib/card-rating";
import { SmartImage } from "~/components/SmartImage";
import { fromPerPersonUsdCents, type PriceBreakdown , hasBreakdown } from "~/lib/experience-pricing";
import { useMoney } from "~/lib/currency-context";
import { listPriceUsdCents } from "~/lib/list-price";
import { GuideChip, OnlyWithMe, Stars, TierBadge } from "./bits";
import { Fallback } from "~/components/design/Fallback";
import { GlassPill } from "~/components/design/Glass";
import { Glyph, type ChipGlyph } from "~/components/design/Chip";
import { Carousel } from "~/components/public/Carousel";
import { galleryPhotos, type PhotoRow } from "~/lib/offering-photos";

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
  /**
   * What stands in for a review, which most guides do not have yet. Both are
   * on `public_guides` already; the card simply was not asking for them, so
   * every card fell through to "No reviews yet" — see lib/card-rating.
   */
  years_experience?: number | null;
  treks_completed_platform?: number | null;
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
  cover_photo_url: string | null;
  guide_slug: string;
  guide_name: string;
  guide_avatar_url: string | null;
  guide_tier: number;
  /** Optional: declared for years and drawn by nothing. A trimmed card row
      does not carry it, and the price it used to feed is now computed on the
      server (card-offering.ts). */
  guide_day_rate_usd_cents?: number | null;
  /** Carries the "New here · 14 years guiding" line when there are no reviews. */
  guide_years_experience?: number | null;
  route_slug?: string | null;
  route_name?: string | null;
  /** Selected only where they are displayed — the compare table. */
  included?: string[] | null;
  meeting_point?: string | null;
  /** Set by toCardOffering; the browser then needs no price_breakdown. */
  from_usd_cents?: number | null;
}

/** The glyph each kind carries on its chip and in its empty state. */
export const KIND_GLYPH: Record<string, ChipGlyph> = {
  trek: "mountain",
  day_hike: "walk",
  food_culture: "spark",
  adventure: "tent",
  city: "city",
};

/**
 * Languages, on one line, without cutting a word in half.
 *
 * Three names joined with commas came to "Nepali, English, S…" in a 211px
 * card: the ellipsis lands mid-word and reads as a rendering fault. Two names
 * and a count is shorter than the space available at every card width, and
 * "+2" is a fact rather than a fragment.
 */
export function langLabel(languages?: string[] | null): string {
  const list = (languages ?? []).filter(Boolean);
  if (list.length === 0) return "";
  if (list.length <= 2) return list.join(", ");
  return `${list.slice(0, 2).join(", ")} +${list.length - 2}`;
}

export function offeringPath(o: { kind: string; slug: string }) {
  return o.kind === "trek" ? `/treks/${o.slug}` : `/experiences/${o.slug}`;
}

export function offeringFromUsdCents(
  o: PublicOffering & { from_usd_cents?: number | null },
): number | null {
  // Already worked out on the server (card-offering.ts), which is how the
  // browser is spared a price_breakdown per card. Undefined means the caller
  // has not been trimmed yet, which is different from a trip with no price.
  if (o.from_usd_cents !== undefined) return o.from_usd_cents;
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
  kinds,
}: {
  guide: PublicGuide;
  rating?: { value: number; count: number };
  languages?: string[];
  /** The kinds of thing this guide lists — "Treks · Day hikes". */
  kinds?: string[] | null;
}) {
  const { mr } = useMoney();
  const line = ratingLine(rating, {
    years: guide.years_experience,
    treks: guide.treks_completed_platform,
    tier: guide.tier,
  });
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
        {/* Tier on a glass pill, top-right (§8). Nothing else over the face.
            There used to be a "~42 min" reply-time chip bottom-left. It was
            removed because it was not true: nothing in this codebase has ever
            computed `median_response_mins` — every value on the site was typed
            into the seed file, and Pemba's was literally 42. A number a
            trekker weighs a person by has to be measured or absent. */}
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
        {/* Stacked at every width: beside the district the name truncated to
            "Pemb…" on a four-up grid, and a guide's name is the one thing on
            the card that must never be cut. */}
        {/* Everything below the quote is one block pinned to the bottom of the
            card, and every row in it is always present.

            Both halves of that matter. The quote is the guide's own words, so
            it runs two lines or three depending on what they said — and with
            the name simply following it, a row of cards put Tenzing's name
            forty pixels above Mingma's. Pinning the block means the quote takes
            the slack at the top and every name, district, rating and rate lands
            on the same line across the row, whatever anyone wrote.

            The rating row used to appear only for guides who have one, which
            reintroduced the same shift a row lower — so a guide with no reviews
            says so on that line instead of vanishing from it. */}
        <div className="mt-auto pt-2.5">
          <div className="flex flex-col gap-0.5">
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
          {/* One line, always, whichever state it is in. A fixed height rather
              than trusting the two to match: "Be the first to review" wrapped
              to two lines in a 211px card and pushed the rate row 35px below
              its neighbours' — the same misalignment one row lower, which is
              the whole thing this block exists to prevent. */}
          {/* What they actually run. The card said what a guide charges and
              how fast they answer, and never once what they would take you
              on — which is the thing somebody is choosing between. */}
          <div className="mt-1.5 flex h-5 items-center">
            <span className="truncate text-sm text-muted">
              {kinds && kinds.length > 0 ? kindsLine(kinds) : langLabel(languages)}
            </span>
          </div>
          {kinds && kinds.length > 0 && (
            <div className="flex h-5 items-center">
              <span className="truncate text-sm text-muted">{langLabel(languages)}</span>
            </div>
          )}
          {/* Reviews last, with the rate, because that is the pair somebody
              weighs against each other at the end of reading a card. Fixed
              height rather than trusting the states to match: "Be the first to
              review" wrapped to two lines in a 211px card and pushed the row
              35px below its neighbours'. */}
          <div className="flex h-5 items-baseline justify-between gap-2 pt-2">
            <span className="flex h-5 items-center">
              {line.stars != null ? (
                <Stars value={line.stars} count={line.count} />
              ) : line.text ? (
                <span className="truncate text-sm text-muted">{line.text}</span>
              ) : null}
            </span>
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
      </div>
    </Link>
  );
}

export function OfferingCard({
  offering,
  rating,
  photos,
}: {
  offering: PublicOffering;
  /** The guide's rating. Absent is normal — a new guide has none. */
  rating?: CardRating | null;
  /**
   * The guide's other uploads for this trip, beyond the cover.
   *
   * `public_offerings` carries only `cover_photo_url`, so a page that wants
   * the slider fetches these in one batched select (offering-photos.server)
   * and hands them down. Left out, the card renders exactly what it always
   * rendered — one photograph — which is what nearly every trip has.
   */
  photos?: readonly PhotoRow[] | null;
}) {
  const { mr } = useMoney();
  const from = offeringFromUsdCents(offering);
  const gallery = galleryPhotos(offering.cover_photo_url, photos, offering.title);
  const line = ratingLine(rating, {
    years: offering.guide_years_experience,
    tier: offering.guide_tier,
  });
  return (
    // Not a <Link> wrapper: the route chip below has to be its own link, and a
    // nested <a> is invalid HTML that breaks hydration. Instead the title link
    // stretches an invisible ::after over the whole card, so the card is still
    // one big tap target and the chip still wins where it sits.
    <div className="group relative flex h-full flex-col overflow-hidden rounded-photo border border-line bg-card shadow-card transition duration-instant ease-out-soft hover:-translate-y-0.5 hover:border-sage hover:shadow-lift">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-wheat">
        {/* More than one picture and it turns over; one and this is the same
            single <SmartImage> as before, which is the case on fifty-four of
            the fifty-seven live trips. The first frame renders on the server
            either way, so a card with JavaScript off still shows a
            photograph (rule 5). */}
        {gallery.length > 1 ? (
          <Carousel
            photos={gallery}
            aspect="4/3"
            rounded={false}
            size="card"
            cover
            className="absolute inset-0 h-full w-full"
            imgClassName="transition duration-slow group-hover:scale-[1.03]"
          />
        ) : gallery.length === 1 ? (
          <SmartImage
            src={gallery[0].url}
            alt={gallery[0].alt}
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
          <span className="text-[11px] font-semibold">{OFFERING_KIND_LABEL[offering.kind] ?? offering.kind}</span>
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
        {/* What other people said about the guide.
            This line used to read "per person · less in a group" — a pricing
            footnote, true of every card, and so carrying no information at
            all. On a platform whose argument is that you pick a person, it is
            the wrong thing to spend the last line on. The price is already on
            the photograph, where a grid is scanned. */}
        <p className="mt-auto flex items-center gap-1 pt-1 text-caption text-muted">
          {line.stars != null ? (
            <>
              <span aria-hidden className="text-ember">
                ★
              </span>
              <span className="font-mono font-medium text-ink">{starText(line.stars)}</span>
              <span>({line.count})</span>
              <span className="sr-only">
                {reviewsLabel(line.count)} for {offering.guide_name}
              </span>
            </>
          ) : (
            <span>{line.text}</span>
          )}
        </p>
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
