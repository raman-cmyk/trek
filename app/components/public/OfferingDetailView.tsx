import { useState } from "react";
import { Form, Link } from "react-router";
import type { OfferingDetailData } from "~/features/offering-detail.server";
import { SmartImage } from "~/components/SmartImage";
import { Carousel, type Photo } from "~/components/public/Carousel";
import { useLightbox } from "~/components/public/Lightbox";
import { BookingWidget } from "~/components/public/BookingWidget";
import { ReviewBlock, Stars, TierBadge } from "~/components/public/bits";
import { ExperienceSplit } from "~/components/Split";
import {
  computeExperiencePricing,
  recompose,
  porterCostOf,
  splitAmounts,
  hasBreakdown,
  type PriceBreakdown,
} from "~/lib/experience-pricing";
import { addOns } from "~/lib/experience-pricing";
import { useMoney } from "~/lib/currency-context";
import { TrailScene } from "~/components/design/TrailScene";
import { Rail } from "~/components/public/Rail";
import { tripItinerary } from "~/lib/trip-itinerary";
import { RatingSummary } from "~/components/public/RatingSummary";
import { OfferingCard } from "~/components/public/cards";
import {
  accessibilityRows,
  activityLevel,
  parseFaqs,
  refCodeWords,
  transportLabels,
  tripLanguages,
} from "~/lib/offering-details";
import { lovedFor, tripFacts, type TripFact } from "~/lib/trip-facts";
import { FREE_CANCELLATION_DAYS } from "~/lib/policy";
import { cn } from "~/lib/cn";
import { Glyph } from "~/components/design/Chip";
import { FactStrip } from "~/components/design/FactStrip";

export function OfferingDetailView({ data }: { data: OfferingDetailData }) {
  const { o, photos, availableDays, reviews, rating, permitPp, routeStops, routeHero, routeMaxAltitude, routeOverview, routeHighlights } = data;
  const { guideLanguages, guideStats, alsoByGuide, alsoOnRoute, railRatings } = data;
  const { m, code } = useMoney();
  const breakdown = (o.price_breakdown ?? null) as PriceBreakdown | null;
  const showBreakdown = hasBreakdown(breakdown);
  const [party, setParty] = useState(o.min_party || 1);
  const [day, setDay] = useState(availableDays[0] ?? "");
  const [addons, setAddons] = useState<Set<string>>(new Set());
  // A porter is the one part of a listed trek people genuinely decide about,
  // so it is a tick box rather than a position on a slider. On by default:
  // it is in the price the guide listed.
  const [porter, setPorter] = useState(true);

  /**
   * The trip as it is currently ticked.
   *
   * This replaced a budget slider. The slider moved two hidden levers at once
   * — teahouse tier and porter — to hit a number, so a reader watched a price
   * change without being told what they had just given up, and no answer it
   * produced was written down anywhere: the enquiry sent the listed package
   * regardless. Tick boxes say what is in the trip, and what is ticked is what
   * gets sent.
   */
  const porterUsdCents = porterCostOf(breakdown);
  const effBreakdown = showBreakdown
    ? porter
      ? breakdown!
      : recompose(breakdown!, { tier: "comfort", porter: false })
    : null;
  // Priced on the date the widget will actually book, so the itemised list a
  // reader is looking at is the one they will be charged — including any
  // seasonal uplift, which moves the moment they change the date.
  const pricing = effBreakdown ? computeExperiencePricing(effBreakdown, party, day || null) : null;
  /**
   * The extras this guide actually offers.
   *
   * These are the lines the guide marked "optional extra" when they priced the
   * trip — gear hire, an extra acclimatisation day, a night in Kathmandu. They
   * were being shown as prices and never as choices: excluded from the
   * headline, impossible to tick, and never sent to anybody. Now they are the
   * package a trekker composes, and what they tick travels with the enquiry.
   *
   * They replace a hardcoded two-item catalogue that changed the total on
   * screen and was never charged for.
   */
  const options = addOns(effBreakdown ?? breakdown ?? ({} as PriceBreakdown), party);
  const addonsPP = options
    .filter((a) => addons.has(a.id))
    .reduce((sum, a) => sum + a.perPersonUsdCents, 0);
  const grandPP = pricing ? pricing.perPersonUsdCents + addonsPP : null;
  /**
   * Does the price actually fall as the party grows?
   *
   * Viator's strip says "Group discounts" on every listing. Ours says it only
   * where it is true, and "true" is the real pricing function answering at
   * both ends of the party rather than a copywriter's assumption — a fixed
   * per-person trip with no fee to split gets no such line.
   */
  const groupPriceDrops = (() => {
    const b = effBreakdown ?? breakdown;
    const hi = Number(o.max_party);
    const lo = Math.max(1, Number(o.min_party) || 1);
    if (!b || !hasBreakdown(b) || !(hi > lo)) return false;
    return (
      computeExperiencePricing(b, hi, null).perPersonUsdCents <
      computeExperiencePricing(b, lo, null).perPersonUsdCents
    );
  })();
  const toggleAddon = (k: string) =>
    setAddons((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  /**
   * The cover and the gallery are one set of pictures, not two.
   *
   * This showed the uploaded photographs when there were any and the cover
   * only when there were none — so a trip with a cover and two uploads showed
   * two pictures and quietly dropped the one chosen to represent it. And a
   * trip with no uploads at all, which is 52 of the 56 live ones, showed a
   * single photograph and no way to tell there was nothing more.
   *
   * The cover leads, then anything not already in the list.
   */
  const carousel: Photo[] = (() => {
    const out: Photo[] = [];
    const seen = new Set<string>();
    const push = (url: string | null | undefined, alt: string, credit: string | null) => {
      const u = (url ?? "").trim();
      if (!u || seen.has(u)) return;
      seen.add(u);
      out.push({ url: u, alt, credit });
    };
    push(o.cover_photo_url, o.title, null);
    for (const p of photos) push(p.url, p.alt_text, p.credit_name);
    return out;
  })();
  // A fourteen-day trek used to answer "what do I do for two weeks?" with the
  // one line its guide had typed, while the route it walks held all fourteen
  // days one table away. Falls back to those, and says so.
  // Tapping one of the strip's photographs opens it full size, the same way
  // the carousel's do on a trip without a route.
  const gallery = useLightbox(carousel.map((c) => ({ url: c.url, alt: c.alt || o.title })));
  const { steps: itinerary, source: itinerarySource } = tripItinerary(
    o.itinerary,
    (data as any).routeDayStops,
    o.kind === "trek" ? o.days : 1,
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 pb-24 lg:pb-6">
      {/* A trail a reader can climb. The page emitted BreadcrumbList data for
          Google and showed the reader nothing — so somebody who landed here
          from a search had no way up except the back button. */}
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
        <Link to={o.kind === "trek" ? "/treks" : "/experiences"} className="hover:text-ink">
          {o.kind === "trek" ? "Treks" : "Experiences"}
        </Link>
        {(o as any).route_slug && (
          <>
            <span aria-hidden className="px-1.5">/</span>
            <Link to={`/routes/${(o as any).route_slug}`} className="hover:text-ink">
              {(o as any).route_name}
            </Link>
          </>
        )}
        <span aria-hidden className="px-1.5">/</span>
        <span className="text-ink">{o.title}</span>
      </nav>

      {/* A trek opens on itself drawn as a walk (docs/07): the route's day
          stops over the cover, or over the route's own photograph, or over
          terrain — never the blank box most trips without a cover used to
          show. Day experiences keep the carousel; they have no walk to draw. */}
      {/* The photographs, on every kind of trip alike.
          A trek used to open on TrailScene, which drew the walk over the
          picture: a white elevation curve and up to four "Day 4 · 5,364 m"
          pins. It obscured the one thing somebody came to look at, and it
          meant a trek that had ten photographs uploaded showed exactly one.
          The walk is still drawn, further down, where a day-by-day belongs. */}
      <div className="relative">
        <Carousel photos={carousel} autoMs={6000} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 p-4 sm:p-6">
          <FactStrip
            onPhoto
            facts={[
              { glyph: "calendar", value: o.days, unit: "days" },
              routeMaxAltitude ? { glyph: "altitude", value: routeMaxAltitude.toLocaleString("en-US"), unit: "m" } : { value: "" },
              o.max_party ? { glyph: "people", value: `up to ${o.max_party}` } : { value: "" },
              (o as any).route_name ? { glyph: "route", value: (o as any).route_name } : { value: "" },
            ]}
          />
        </div>
      </div>

      {/* Every other photograph of this trip.
          A trek with a route opens on TrailScene, which draws one picture over
          the walk — so a trek that had ten photographs uploaded showed exactly
          one of them, and there was nowhere on the page the other nine could
          appear. The carousel only ever ran on trips with no route to draw.
          Now the rest of the pictures always have somewhere to be. */}
      {routeStops.length >= 2 && carousel.length > 1 && (
        <section className="mt-3">
          <Rail itemClassName="w-[70vw] max-w-[360px] sm:w-[300px]">
            {carousel.slice(1).map((ph) => (
              <button
                key={ph.url}
                type="button"
                onClick={() => gallery.open(carousel.indexOf(ph))}
                className="group block w-full cursor-zoom-in overflow-hidden rounded-photo border border-line bg-wheat"
                aria-label={`See this photograph of ${o.title} larger`}
              >
                <SmartImage
                  src={ph.url}
                  alt={ph.alt || o.title}
                  width={360}
                  height={240}
                  cover
                  className="aspect-[3/2] w-full"
                  imgClassName="transition duration-slow group-hover:scale-[1.03]"
                />
              </button>
            ))}
          </Rail>
          {gallery.node}
        </section>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <header>
            <h1 className="font-display text-3xl text-ink">{o.title}</h1>
            <p className="mt-1 text-sm text-ink-soft">
              {o.kind === "trek" ? `${o.days} days` : "Day experience"}
              {o.max_party ? ` · up to ${o.max_party} people` : ""}
              {/* The route page is where the altitude profile, the permits and
                  every other guide who runs it live. From a trek page it is the
                  most useful next click there is. */}
              {(o as any).route_slug && (
                <>
                  {" · "}
                  <Link
                    to={`/routes/${(o as any).route_slug}`}
                    prefetch="intent"
                    className="text-moss underline decoration-sage underline-offset-2 hover:decoration-moss"
                  >
                    {(o as any).route_name} route
                  </Link>
                </>
              )}
            </p>
          </header>

          {/* Guide block — the product, above the fold */}
          <Link
            to={`/guides/${o.guide_slug}`}
            prefetch="intent"
            className="flex items-center gap-4 rounded-photo border border-border p-4 shadow-card transition duration-quick hover:-translate-y-0.5 hover:shadow-lift"
          >
            <SmartImage
              src={o.guide_avatar_url ?? ""}
              alt={o.guide_name}
              width={64}
              height={64}

              className="h-16 w-16 rounded-full"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-ink">Led by {o.guide_name}</p>
                <TierBadge tier={o.guide_tier} static />
              </div>
              {rating && <Stars value={rating.value} count={rating.count} />}
              {/* The evidence, not just the badge.
                  This panel said "Led by Pemba" beside a tier badge, which
                  means nothing to somebody who arrived from a search two
                  seconds ago. Trips led, years guiding and how fast they
                  answer are the three things that make a stranger in Nepal a
                  person you would send money to. */}
              <GuideNumbers stats={guideStats} />
              <p className="text-sm text-primary">Full profile →</p>
            </div>
          </Link>

          {/* Message-before-pay — a free conversation, no money (v3 §2). */}
          <Form method="post" action="/conversations" className="-mt-4">
            <input type="hidden" name="guide_id" value={o.guide_id} />
            <input type="hidden" name="offering_id" value={o.id} />
            <input
              type="hidden"
              name="next"
              value={data.canonical ? new URL(data.canonical).pathname : "/"}
            />
            <button className="w-full rounded-button border border-moss px-4 py-2.5 text-sm font-medium text-moss hover:bg-mist">
              Message {o.guide_name.split(" ")[0]} — free, before you book
            </button>
          </Form>

          {/* Going with people is the normal case on a two-week trek, and it
              is where the plan usually falls apart — one person fronts the
              cost and chases the rest. Offer the group here, at the moment
              someone thinks "I should ask Tom". */}
          <Link
            to={`/groups/new?offering=${o.id}`}
            prefetch="intent"
            className="-mt-2 flex items-center justify-between gap-3 rounded-card border border-line bg-card px-4 py-3 text-sm hover:border-sage hover:bg-mist"
          >
            <span className="min-w-0">
              <span className="block font-medium text-ink">Going with other people?</span>
              <span className="block text-caption text-muted">
                Make a trip they can join — split the cost, or one of you pays.
              </span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-moss">
              →
            </span>
          </Link>

          {/* ── What this trip is, in one block.
               "The section directly below the images includes details like
               timing, pickup availability, discounts and English language
               availability, and a 'Why travellers love this' block" — the
               founder, comparing us with Viator. We held nearly all of it and
               had it scattered: the meeting point two screens down, how hard
               it is at the very bottom under "Other details", the languages
               beside it, and the party size only inside the booking widget.
               Built by app/lib/trip-facts.ts, which shows only what this trip
               has actually filled in. */}
          <TripSummary
            facts={tripFacts(o as any, {
              languages: tripLanguages((o as any).languages, guideLanguages),
              groupPriceDrops,
              freeCancellationDays: FREE_CANCELLATION_DAYS,
            })}
            rating={rating}
            reviews={reviews}
            guideFirstName={o.guide_name.split(" ")[0]}
          />

          {/* Porter-welfare pledge (v3 Phase 3) */}
          {o.guide_porter_welfare && (
            <Link
              to="/trust#porters"
              className="-mt-2 flex items-center gap-2 rounded-card border border-accent/30 bg-accent/5 px-3 py-2 text-sm text-ink-soft hover:bg-accent/10"
            >
              <span aria-hidden>🎒</span>
              <span>
                <span className="font-medium text-ink">Porter-welfare pledge</span> — fair pay,
                weight limits & insurance for every porter on this trip.
              </span>
            </Link>
          )}

          {/* Backup guide — the trek never cancels (v3 §12). */}
          {o.kind === "trek" && o.backup_guide_name && (
            <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-3">
              <SmartImage
                src={o.backup_guide_avatar_url ?? ""}
                alt={o.backup_guide_name}
                width={40}
                height={40}
                className="h-10 w-10 rounded-full"
              />
              <p className="text-sm text-ink-soft">
                <span className="font-medium text-ink">Backed up by{" "}
                  <Link to={`/guides/${o.backup_guide_slug}`} className="text-primary hover:underline">
                    {o.backup_guide_name}
                  </Link>
                </span>
                {" "}— if {o.guide_name.split(" ")[0]} can't lead, {o.backup_guide_name.split(" ")[0]} steps
                in. Your trek never cancels on you.
              </p>
            </div>
          )}

          {/* The overview. This was one unheaded sentence — the trek page
              asked somebody to weigh a fortnight of their life against a
              line of card copy. The route's own `overview` and `highlights`
              have existed since 0076 and were rendered only on /routes/:slug;
              they are the same words, on the page where the decision is
              actually made. */}
          <section>
            <h2 className="font-display text-2xl text-ink">Overview</h2>
            <p className="mt-3 max-w-[64ch] text-body-l text-ink">{o.summary}</p>
            {routeOverview?.trim() ? (
              <div className="mt-4 max-w-[64ch] space-y-4 text-body-l text-ink">
                {routeOverview.split(/\n{2,}/).map((para: string, i: number) => (
                  <p key={i}>{para.trim()}</p>
                ))}
              </div>
            ) : null}
            {routeHighlights?.length ? (
              <ul className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {routeHighlights.map((h: string, i: number) => (
                  <li key={i} className="flex gap-3 text-ink">
                    <Glyph name="mountain" className="mt-1 shrink-0 text-moss" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {/* Price breakdown — transaction layer: plain, mono, everything shown.
              Per-person price recomputes live as the group grows (v3 §0). */}
          {showBreakdown && pricing && (
            <section className="rounded-card border border-line bg-card p-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-display text-xl text-ink">What you pay</h2>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted">Group</span>
                  <button
                    type="button"
                    aria-label="Fewer"
                    onClick={() => setParty(Math.max(o.min_party || 1, party - 1))}
                    className="h-8 w-8 rounded-full border border-line text-lg leading-none hover:border-ink"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-mono font-medium">{party}</span>
                  <button
                    type="button"
                    aria-label="More"
                    onClick={() => setParty(Math.min(o.max_party || 12, party + 1))}
                    className="h-8 w-8 rounded-full border border-line text-lg leading-none hover:border-ink"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="mt-4">
                {/* By bucket, not by position — see splitAmounts. Read
                    positionally this threw on any trip with fewer than six
                    priced lines, and silently mislabelled the money on any
                    itemised trip with more. */}
                <ExperienceSplit
                  amounts={splitAmounts(pricing)}
                  total={pricing.perPersonUsdCents}
                  showAmounts
                />
              </div>

              {party > 1 && pricing.groupSavingsEachUsdCents > 0 && (
                <p className="mt-3 rounded-button bg-mist px-3 py-2 text-sm text-pine">
                  Guide fee split {party} ways → you save{" "}
                  <span className="font-mono font-medium">
                    {m(pricing.groupSavingsEachUsdCents)}
                  </span>{" "}
                  each vs going solo.
                </p>
              )}

              {/* What is optional, as boxes. Everything ticked here is in the
                  price above and travels with the request. */}
              {porterUsdCents > 0 && (
                <div className="mt-5 border-t border-line pt-4">
                  {/* Named for what it does, not "What is included" — there
                      is a section with that heading further down the page, and
                      two headings a hundred lines apart saying almost the same
                      words is most of why the founder called this unclear. */}
                  <p className="mb-2 text-sm font-medium text-ink">Add to your quote</p>
                  <label className="flex cursor-pointer items-start justify-between gap-3">
                    <span>
                      <span className="text-sm text-ink">Porter</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        Carries your bag between teahouses. Without one you walk
                        with everything you brought.
                      </span>
                    </span>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <span className="font-mono text-sm text-ink">{m(porterUsdCents)}</span>
                      <input
                        type="checkbox"
                        checked={porter}
                        onChange={() => setPorter((v) => !v)}
                        aria-label="Include a porter"
                      />
                    </span>
                  </label>
                </div>
              )}

              {/* The extras, ticked on and off. Each is a line the guide
                  wrote and priced — nothing hidden, nothing invented here. */}
              {options.length > 0 && (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="mb-2 text-sm font-medium text-ink">Add if you want it</p>
                  <div className="space-y-2">
                    {options.map((a) => (
                      <label
                        key={a.id}
                        className="flex cursor-pointer items-start justify-between gap-3"
                      >
                        <span className="text-sm text-ink">{a.label}</span>
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <span className="font-mono text-sm text-ink">
                            +{m(a.perPersonUsdCents)}
                          </span>
                          <input
                            type="checkbox"
                            checked={addons.has(a.id)}
                            onChange={() => toggleAddon(a.id)}
                            aria-label={`Add ${a.label}`}
                          />
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Ticked extras go to {o.guide_first_name} with your dates. Nothing
                    is charged until you both agree the trip.
                  </p>
                </div>
              )}

              {/* Grand total — the one number, matching the booking box. */}
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <span className="font-medium text-ink">Your total</span>
                <span className="font-mono text-lg font-medium text-ink">
                  {m(grandPP!)} <span className="text-sm text-muted">· per person</span>
                </span>
              </div>

              <p className="mt-2 text-xs text-muted">
                This is the whole package — everything ticked above is in that
                number. Permits, porters and logistics are per person; the guide
                fee is shared across your group. The Fund line?{" "}
                <Link to="/fund" className="text-primary hover:underline">
                  See where it goes →
                </Link>
                {" "}
                {code !== "USD" && (
                  <>
                    {" "}
                    Prices shown in {code} are approximate — you're charged in USD.
                  </>
                )}
              </p>
            </section>
          )}

          {itinerary.length > 0 && (
            <section>
              <h2 className="mb-1 font-display text-xl">
                {o.kind === "trek" ? "Itinerary" : "What you'll do"}
              </h2>
              {/* Whose plan this is. The route's standard stages printed as
                  this guide's own is a small lie that becomes a complaint on
                  day three. */}
              {itinerarySource === "route" && (
                <p className="mb-3 max-w-[60ch] text-caption text-muted">
                  The standard stages for{" "}
                  {(o as any).route_slug ? (
                    <Link
                      to={`/routes/${(o as any).route_slug}`}
                      prefetch="intent"
                      className="text-moss underline decoration-sage underline-offset-2 hover:decoration-moss"
                    >
                      {(o as any).route_name}
                    </Link>
                  ) : (
                    "this route"
                  )}
                  . {o.guide_name.split(" ")[0]} may vary them for weather, for
                  how you are walking, or to keep you off the busiest days —
                  ask before you book.
                </p>
              )}
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

          {/* What you get and what you do not, as one block with a heading.
              It was two small <h3>s in a bare grid between the itinerary and
              the meeting point, with each column disappearing when empty — so
              a trip that listed exclusions and nothing else rendered a lone
              "Not included" and read as a warning. Both columns are always
              drawn now, and an empty one says so. */}
          {(o.included?.length || o.excluded?.length) ? (
            <section className="rounded-card border border-line bg-card p-5">
              <h2 className="font-display text-2xl text-ink">What's included</h2>
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-ink-soft">
                    In the price
                  </h3>
                  {o.included?.length ? (
                    <ul className="space-y-1.5 text-ink">
                      {o.included.map((x: string) => (
                        <li key={x} className="flex gap-2">
                          <span aria-hidden className="shrink-0 text-accent">✓</span>
                          <span>{x}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">Ask {o.guide_name.split(" ")[0]} what this covers.</p>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-ink-soft">
                    Not in the price
                  </h3>
                  {o.excluded?.length ? (
                    <ul className="space-y-1.5 text-ink-soft">
                      {o.excluded.map((x: string) => (
                        <li key={x} className="flex gap-2">
                          <span aria-hidden className="shrink-0 text-muted">✕</span>
                          <span>{x}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">Nothing else to pay on the trail.</p>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          {o.meeting_point && (
            <section>
              <h3 className="mb-1 font-medium">Meeting point</h3>
              <p className="text-sm text-ink-soft">{o.meeting_point}</p>
            </section>
          )}

          {/* ── How you move.
               "Is there a flight to Lukla, and is it in the price?" was a
               message to the guide on every single trek, because the page did
               not say. Every page we are compared with answers it in a row. */}
          {(transportLabels((o as any).transport).length > 0 || (o as any).transport_note) && (
            <section>
              <h2 className="mb-2 font-display text-xl">Getting there and around</h2>
              {transportLabels((o as any).transport).length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {transportLabels((o as any).transport).map((t) => (
                    <li
                      key={t}
                      className="rounded-pill border border-line bg-card px-3 py-1 text-sm text-ink"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              )}
              {(o as any).transport_note && (
                <p className="mt-2 max-w-[62ch] text-sm text-ink-soft">
                  {(o as any).transport_note}
                </p>
              )}
            </section>
          )}

          {/* ── The facts a reader checks last and cancels over. */}
          <OtherDetails o={o} languages={tripLanguages((o as any).languages, guideLanguages)} />

          {/* ── The questions the office answers by email every week. */}
          {parseFaqs((o as any).faqs).length > 0 && (
            <section id="faq" className="scroll-mt-6">
              <h2 className="mb-3 font-display text-xl">Questions people ask</h2>
              <ul className="divide-y divide-line rounded-card border border-line">
                {parseFaqs((o as any).faqs).map((f) => (
                  <li key={f.q}>
                    {/* <details>, so every answer is in the HTML and on the
                        page with no JavaScript — which is both how Google
                        reads it and how it works on a 3G phone. */}
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-3 font-medium text-ink hover:bg-mist/50">
                        {f.q}
                        <span
                          aria-hidden
                          className="mt-0.5 shrink-0 text-muted transition-transform duration-quick group-open:rotate-180"
                        >
                          ⌄
                        </span>
                      </summary>
                      <p className="max-w-[68ch] px-3 pb-3 text-sm text-ink-soft">{f.a}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {reviews.length > 0 && (
            <section id="reviews" className="scroll-mt-6 space-y-4">
              <h2 className="font-display text-xl">Reviews</h2>
              {/* The spread, not only its mean: somebody deciding between two
                  strangers wants to know whether a 4.6 is everybody agreeing
                  or two people who hated it. */}
              <RatingSummary reviews={reviews} />
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
            title: o.title,
          }}
          priceBreakdown={effBreakdown ?? breakdown}
          addonsPerPerson={addonsPP}
          selectedOptions={[
            ...options.filter((a) => addons.has(a.id)).map((a) => a.id),
            // Dropping the porter is a decision about the trip, so it goes
            // with the request rather than only changing a number on screen.
            ...(porterUsdCents > 0 && !porter ? ["no_porter"] : []),
          ]}
          party={party}
          setParty={setParty}
          standing={data.standing ?? null}
          day={day}
          setDay={setDay}
          availableDays={availableDays}
          returnTo={data.canonical ? new URL(data.canonical).pathname : "/"}
        />
      </div>

      {/* ── Two rails, because this page used to be a dead end.
           Somebody who likes the guide but not this trip wants their other
           work; somebody who likes the route but not the guide wants to see
           who else walks it. Every page we are compared with ends with both,
           and on a platform whose argument is that you pick a person, the
           second rail is the argument itself. */}
      {alsoByGuide.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-2xl text-ink">
            More from {o.guide_name.split(" ")[0]}
          </h2>
          <p className="mt-1 text-sm text-muted">
            The same guide, a different trip — same rate, same calendar.
          </p>
          <div className="mt-4">
            <Rail>
              {alsoByGuide.map((x: any) => (
                <OfferingCard key={x.id} offering={x} rating={railRatings[x.guide_id]} />
              ))}
            </Rail>
          </div>
        </section>
      )}

      {alsoOnRoute.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-2xl text-ink">
            {(o as any).route_name
              ? `Other guides on ${(o as any).route_name}`
              : "Trips like this one"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {(o as any).route_name
              ? "The same route, led by somebody else. Compare the people, not the packages."
              : "A different guide, the same kind of day."}
          </p>
          <div className="mt-4">
            <Rail>
              {alsoOnRoute.map((x: any) => (
                <OfferingCard key={x.id} offering={x} rating={railRatings[x.guide_id]} />
              ))}
            </Rail>
          </div>
        </section>
      )}
    </main>
  );
}

/**
 * Trips led, years guiding, how fast they answer.
 *
 * Only what we actually hold: a guide with no completed trips on the platform
 * shows years and a response time, not a zero. A zero here is worse than a
 * gap — it reads as a guide nobody has ever booked, when it usually means a
 * guide who joined last week.
 */
function GuideNumbers({
  stats,
}: {
  stats: {
    years_experience: number | null;
    treks_completed_platform: number | null;
    median_response_mins: number | null;
  } | null;
}) {
  if (!stats) return null;
  const bits: string[] = [];
  if (stats.treks_completed_platform && stats.treks_completed_platform > 0) {
    bits.push(
      `${stats.treks_completed_platform} ${stats.treks_completed_platform === 1 ? "trip" : "trips"} led here`,
    );
  }
  if (stats.years_experience && stats.years_experience > 0) {
    bits.push(`${stats.years_experience} years guiding`);
  }
  if (stats.median_response_mins && stats.median_response_mins > 0) {
    const m = stats.median_response_mins;
    bits.push(`replies in about ${m < 60 ? `${m} min` : `${Math.round(m / 60)} hr`}`);
  }
  if (bits.length === 0) return null;
  return <p className="mt-0.5 text-sm text-muted">{bits.join(" · ")}</p>;
}

/**
 * The row of ordinary fact a trip page is expected to carry.
 *
 * On the pages a trekker compares us with this is a plain labelled block near
 * the foot: how hard it is, what your guide will speak on the day, who the
 * trip suits, a reference to quote in an email. Ours had none of it, so every
 * one of those questions arrived as a message — and "not suitable if you have
 * limited mobility" arrived after somebody had already paid.
 */
/**
 * The facts, and why the people who went rated it.
 *
 * Two halves of the same question — "what is this, and was it any good?" —
 * asked at the point a reader has just decided they like the guide. The
 * reviews here are the two fullest; the whole list stays further down the
 * page in the order it was written, so this hides nothing.
 */
function TripSummary({
  facts,
  rating,
  reviews,
  guideFirstName,
}: {
  facts: TripFact[];
  rating: { value: number; count: number } | null;
  reviews: Array<{
    id: string;
    overall: number;
    body: string | null;
    published_at: string | null;
    author_name: string | null;
    author_country: string | null;
  }>;
  guideFirstName: string;
}) {
  const loved = lovedFor(reviews);
  if (facts.length === 0 && loved.length === 0) return null;

  return (
    <section className="-mt-2 overflow-hidden rounded-card border border-line bg-card">
      {facts.length > 0 && (
        <dl className="grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.key} className="flex min-w-0 gap-2.5">
              <span aria-hidden className="mt-0.5 shrink-0 text-moss">
                <Glyph name="check" />
              </span>
              <span className="min-w-0">
                <dt className="font-medium text-ink">{f.label}</dt>
                {f.hint && <dd className="mt-0.5 text-sm text-ink-soft">{f.hint}</dd>}
              </span>
            </div>
          ))}
        </dl>
      )}

      {loved.length > 0 && (
        <div className="border-t border-line bg-mist/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="font-display text-lg text-ink">
              Why travellers loved this
            </h2>
            {rating && (
              <p className="text-sm text-ink-soft">
                <Stars value={rating.value} count={rating.count} /> for {guideFirstName}
              </p>
            )}
          </div>
          {/* One review does not want half a row with a hole beside it. */}
          <ul className={cn("mt-3 grid gap-3", loved.length > 1 && "sm:grid-cols-2")}>
            {loved.map((r) => (
              <li key={r.id} className="min-w-0 rounded-button border border-line bg-card p-3.5">
                <Stars value={r.overall} />
                <blockquote className="mt-1.5 text-sm leading-relaxed text-ink">
                  &ldquo;{r.body}&rdquo;
                </blockquote>
                <p className="mt-2 text-caption text-muted">
                  {r.author_name}
                  {r.author_country ? `, ${r.author_country}` : ""}
                </p>
              </li>
            ))}
          </ul>
          {reviews.length > loved.length && (
            <p className="mt-3 text-sm">
              <a href="#reviews" className="text-moss underline-offset-4 hover:underline">
                Read all {reviews.length} reviews →
              </a>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function OtherDetails({ o, languages }: { o: any; languages: string[] }) {
  const level = activityLevel(o.activity_level);
  const access = accessibilityRows(o.accessibility);
  const ref = refCodeWords(o.ref_code);
  if (!level && languages.length === 0 && access.length === 0 && !ref) return null;

  return (
    <section>
      <h2 className="font-display text-xl">Other details</h2>
      <dl className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {level && (
          <div>
            <dt className="label text-muted">How hard it is</dt>
            <dd className="mt-0.5 text-ink">
              {level.label}
              <span className="mt-0.5 block max-w-[46ch] text-sm text-ink-soft">
                {level.blurb}
              </span>
            </dd>
          </div>
        )}

        {languages.length > 0 && (
          <div>
            <dt className="label text-muted">Languages on the trip</dt>
            <dd className="mt-0.5 text-ink">{languages.join(", ")}</dd>
          </div>
        )}

        {access.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="label text-muted">Who it suits</dt>
            <dd className="mt-1">
              {/* Cautions sort last and carry a different mark. "Not suitable
                  if you have limited mobility" as a green tick beside "service
                  animals welcome" is how somebody books a trip they then have
                  to cancel. */}
              <ul className="space-y-1 text-sm">
                {access.map((a) => (
                  <li key={a.label} className="flex items-start gap-2">
                    <span aria-hidden className={a.warn ? "text-ember" : "text-moss"}>
                      {a.warn ? "!" : "✓"}
                    </span>
                    <span className={a.warn ? "text-ink" : "text-ink-soft"}>{a.label}</span>
                  </li>
                ))}
              </ul>
              {o.accessibility_note && (
                <p className="mt-2 max-w-[62ch] text-sm text-ink-soft">{o.accessibility_note}</p>
              )}
            </dd>
          </div>
        )}

        {ref && (
          <div>
            <dt className="label text-muted">Trip reference</dt>
            {/* Quote this in an email and the office finds the trip in one
                search, instead of asking which Everest trek you mean. */}
            <dd className="mt-0.5 font-mono text-ink">{ref}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
