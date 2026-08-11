import { Link } from "react-router";
import { SmartImage } from "~/components/SmartImage";
import { fromPerPersonUsdCents, type PriceBreakdown } from "~/lib/experience-pricing";
import { useMoney } from "~/lib/currency-context";
import { GuideChip, OnlyWithMe, ResponseChip, Stars, TierBadge } from "./bits";
import { cn } from "~/lib/cn";
import { firstName } from "~/lib/names";

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

/**
 * How a guide card is arranged. Same design system, different composition —
 * a page of seven rows built from one template is the thing that reads as
 * machine-made, however good the template is.
 *
 *   stack   portrait on top, words under it. The default.
 *   overlay the quote sits over the foot of the portrait.
 *   beside  a small square face to the left of the words, on a wide card.
 */
export type GuideCardLayout = "stack" | "overlay" | "beside";

/**
 * One guide.
 *
 * The hierarchy used to be upside down: the name at 20px semibold and the
 * guide's own sentence at 14px in a bordered box. Names carry no visual
 * difference — every card's largest text was a proper noun, so every card
 * looked identical. The sentence is the only thing on the card that differs
 * card to card, so it takes the size and the name becomes its byline.
 *
 * Heights are equal by construction: the meta row is pinned with mt-auto and
 * the rating renders a same-height placeholder when a guide has none, so the
 * bottom edges of a row line up instead of stepping.
 */
/**
 * As many languages as fit on one line, and a count for the rest.
 *
 * `budget` is in characters, tuned per layout width. It is a heuristic, but a
 * deterministic one — the same guide always renders the same line, on the
 * server and on the client, which a measure-the-DOM approach would not.
 */
function fitLanguages(langs: string[] | undefined, budget: number): [string[], number] {
  if (!langs?.length) return [[], 0];
  const shown: string[] = [];
  let used = 0;
  for (const l of langs) {
    const cost = used === 0 ? l.length : l.length + 3; // " · "
    if (used + cost > budget && shown.length > 0) break;
    shown.push(l);
    used += cost;
  }
  return [shown, langs.length - shown.length];
}

export function GuideCard({
  guide,
  rating,
  languages,
  layout = "stack",
  lead = false,
}: {
  guide: PublicGuide;
  rating?: { value: number; count: number };
  languages?: string[];
  layout?: GuideCardLayout;
  /** First card in a row: wider, and the quote a step up. */
  lead?: boolean;
}) {
  const { mr } = useMoney();
  const first = firstName(guide.full_name);
  const alt = `${first}, trekking guide in ${guide.home_district ?? "Nepal"}`;
  const [shownLangs, hiddenLangs] = fitLanguages(languages, layout === "beside" ? 24 : 30);

  // Hairline, no ambient shadow, crisp radius. A soft drop shadow under every
  // card is the SaaS-template surface; a 1px line is a decision.
  const shell =
    "group flex h-full overflow-hidden rounded-card border border-line bg-card " +
    "transition-colors duration-instant ease-out-soft hover:border-sage";

  const quote = guide.only_with_me ? (
    <OnlyWithMe line={guide.only_with_me} large={lead} />
  ) : guide.hook_line ? (
    <p
      className={cn(
        "font-display font-medium leading-[1.3] tracking-[-0.02em] text-ink",
        lead ? "text-[19px] sm:text-[21px]" : "text-[19px]",
      )}
    >
      {guide.hook_line}
    </p>
  ) : null;

  const byline = (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-[15px] font-semibold leading-tight text-ink">{first}</span>
      {guide.home_district && (
        <span className="text-[13px] leading-tight text-muted">{guide.home_district}</span>
      )}
    </p>
  );

  const meta = (
    <div className="mt-auto space-y-1.5 pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <Stars value={rating?.value ?? 0} count={rating?.count} />
        {guide.day_rate_usd_cents && (
          <span className="text-[13px] text-muted">
            <span className="font-mono text-[15px] font-medium text-ink">
              {mr(guide.day_rate_usd_cents)}
            </span>
            /day
          </span>
        )}
      </div>
      {/* Cut by character budget, not by pixels or by count. `truncate` and
          `line-clamp` break wherever the box ends — "Nepali · English · Gurun…"
          — which reads as a rendering fault; a fixed count of three still
          wrapped to a second line for long names like Gurung, and a wrapped
          line pushes the row below it out of alignment with its neighbours.
          A budget keeps it to exactly one line whatever the languages are. */}
      {shownLangs.length > 0 && (
        <p className="text-[13px] text-muted">
          {shownLangs.join(" · ")}
          {hiddenLangs > 0 && (
            <span> +<span className="font-mono">{hiddenLangs}</span></span>
          )}
        </p>
      )}
      <ResponseChip mins={guide.median_response_mins} />
    </div>
  );

  if (layout === "beside") {
    return (
      <Link to={`/guides/${guide.slug}`} prefetch="intent" className={cn(shell, "flex-row")}>
        <div className="relative w-28 shrink-0 sm:w-36">
          <SmartImage src={guide.avatar_url ?? ""} alt={alt} width={288} height={288} cover
            className="h-full w-full" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
          <div className="space-y-1.5">
            {quote}
            {byline}
          </div>
          {meta}
        </div>
      </Link>
    );
  }

  if (layout === "overlay") {
    // The quote lives on the photograph, so the body below it is only a
    // byline and a meta row — short. Letting the photo flex means the slack
    // in a row goes into the image rather than into a hole between the name
    // and the rating, which is what mt-auto alone produced.
    return (
      <Link to={`/guides/${guide.slug}`} prefetch="intent" className={cn(shell, "flex-col")}>
        <div className="relative min-h-[13rem] flex-1">
          <SmartImage src={guide.avatar_url ?? ""} alt={alt} width={480} height={600} cover
            className="h-full w-full" />
          <div className="absolute right-2.5 top-2.5">
            <TierBadge tier={guide.tier} static />
          </div>
          {/* The quote breaks the frame: it sits on the photograph's foot with
              a scrim only where it needs one. */}
          {quote && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-4 pb-3.5 pt-10">
              <div className="[&_p]:text-paper [&_span]:text-paper/60">{quote}</div>
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col p-4">
          {byline}
          <div className="space-y-1.5 pt-3">
            <div className="flex items-baseline justify-between gap-3">
              <Stars value={rating?.value ?? 0} count={rating?.count} />
              {guide.day_rate_usd_cents && (
                <span className="text-[13px] text-muted">
                  <span className="font-mono text-[15px] font-medium text-ink">
                    {mr(guide.day_rate_usd_cents)}
                  </span>
                  /day
                </span>
              )}
            </div>
            <ResponseChip mins={guide.median_response_mins} />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link to={`/guides/${guide.slug}`} prefetch="intent" className={cn(shell, "flex-col")}>
      <div className="relative">
        <SmartImage src={guide.avatar_url ?? ""} alt={alt} width={480} height={600}
          className={cn("w-full", lead ? "aspect-[5/4]" : "aspect-[4/5]")} />
        <div className="absolute right-2.5 top-2.5">
          <TierBadge tier={guide.tier} static />
        </div>
      </div>
      {/* Tight cluster inside: quote → name → district sit close, and the
          only large gap on the card is the one before the meta row. */}
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="space-y-1.5">
          {quote}
          {byline}
        </div>
        {meta}
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
    <div className="group relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-card transition-colors duration-instant ease-out-soft hover:border-sage">
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
            name={firstName(offering.guide_name)}
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
