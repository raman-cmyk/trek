import { useState } from "react";
import { Form, Link } from "react-router";
import type { OfferingDetailData } from "~/features/offering-detail.server";
import { SmartImage } from "~/components/SmartImage";
import { Carousel, type Photo } from "~/components/public/Carousel";
import { BookingWidget } from "~/components/public/BookingWidget";
import { ReviewBlock, Stars, TierBadge } from "~/components/public/bits";
import { ExperienceSplit } from "~/components/Split";
import {
  computeExperiencePricing,
  recompose,
  budgetConfigs,
  pickConfig,
  TEAHOUSE_LABEL,
  hasBreakdown,
  type PriceBreakdown,
} from "~/lib/experience-pricing";
import { addOns } from "~/lib/experience-pricing";
import { useMoney } from "~/lib/currency-context";
import { AvailabilityCalendar } from "~/components/public/AvailabilityCalendar";
import { startableNote } from "~/lib/availability";
import { PaymentTerms } from "~/components/public/PaymentTerms";
import { partyWords } from "~/lib/party";
import {
  accessibilityRows,
  activityLevel,
  parseFaqs,
  refCodeWords,
  transportLabels,
  tripLanguages,
} from "~/lib/offering-details";
import { RatingSummary } from "~/components/public/RatingSummary";
import { OfferingCard } from "~/components/public/cards";
import { Rail } from "~/components/public/Rail";
import { useTripQuote } from "~/components/public/BookingWidget";
import { fmtDate } from "~/lib/format";

export function OfferingDetailView({ data }: { data: OfferingDetailData }) {
  const { o, photos, availableDays, reviews, rating, permitPp } = data;
  const { guideLanguages, moreByGuide, similar, railRatings } = data as any;
  const { openDays, availability, span, monthAnchor, today } = data as any;
  const { m, code } = useMoney();
  const breakdown = (o.price_breakdown ?? null) as PriceBreakdown | null;
  const showBreakdown = hasBreakdown(breakdown);
  const [party, setParty] = useState(o.min_party || 1);
  const [day, setDay] = useState(availableDays[0] ?? "");
  const [budgetTarget, setBudgetTarget] = useState<number | null>(null); // null = full package
  const [addons, setAddons] = useState<Set<string>>(new Set());

  // Budget recomposer (v3 §1c): the slider hits a target by swapping teahouse
  // tier / porter; the package (and the fee that follows it) recomposes live.
  const configs = showBreakdown ? budgetConfigs(breakdown!, party) : [];
  const minP = configs[0]?.perPersonUsdCents ?? 0;
  const maxP = configs[configs.length - 1]?.perPersonUsdCents ?? 0;
  const target = budgetTarget == null ? maxP : Math.min(Math.max(budgetTarget, minP), maxP);
  const selected = showBreakdown ? pickConfig(configs, target) : null;
  const effBreakdown = selected
    ? recompose(breakdown!, { tier: selected.tier, porter: selected.porter })
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
  // Exact, sequential per-lever deltas vs the full comfort package (they sum).
  const afterTeahouse =
    selected && showBreakdown
      ? computeExperiencePricing(
          recompose(breakdown!, { tier: selected.tier, porter: true }),
          party,
          day || null,
        ).perPersonUsdCents
      : 0;
  const teahouseDelta = afterTeahouse - maxP;
  const porterDelta = selected ? selected.perPersonUsdCents - afterTeahouse : 0;
  // One shape, priced once: the card and the terms below the calendar have to
  // name the same deposit, so they read the same quote rather than each doing
  // its own sums.
  const widgetOffering = {
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
  };
  const quote = useTripQuote(widgetOffering, party, effBreakdown ?? breakdown, addonsPP);
  const partyTotalUsdCents = quote ? quote.headline * (quote.perPerson ? party : 1) : 0;

  const toggleAddon = (k: string) =>
    setAddons((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
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
      {/* A trail a reader can climb. The page had breadcrumb structured data
          for Google and nothing at all for the person — so the only way back
          to "every Annapurna trek" was the browser button. */}
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link to="/" className="hover:text-ink hover:underline">
              Home
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li>
            <Link
              to={o.kind === "trek" ? "/routes" : "/experiences"}
              className="hover:text-ink hover:underline"
            >
              {o.kind === "trek" ? "Treks" : "Experiences"}
            </Link>
          </li>
          {(o as any).route_slug && (
            <>
              <li aria-hidden>›</li>
              <li>
                <Link
                  to={`/routes/${(o as any).route_slug}`}
                  className="hover:text-ink hover:underline"
                >
                  {(o as any).route_name}
                </Link>
              </li>
            </>
          )}
          <li aria-hidden>›</li>
          <li aria-current="page" className="truncate text-ink">
            {o.title}
          </li>
        </ol>
      </nav>

      <Carousel photos={carousel} />

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <header>
            <h1 className="font-display text-3xl text-ink">{o.title}</h1>
            {/* The four things somebody asks before they read a word of the
                description: how long, how many people, what time it starts,
                and where from. They were scattered — the party limit was a
                clause in a grey line, the start time was not shown at all —
                so they are a list now. */}
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-ink">
              <li className="flex items-center gap-2">
                <IconClock />
                {o.kind === "trek" ? `${o.days} ${o.days === 1 ? "day" : "days"}` : "One day"}
              </li>
              <li className="flex items-center gap-2">
                <IconPeople />
                {partyWords(o.min_party, o.max_party)}
              </li>
              {(o as any).meet_time && (
                <li className="flex items-center gap-2">
                  <IconClock />
                  Starts {String((o as any).meet_time).slice(0, 5)}
                </li>
              )}
              {o.meeting_point && (
                <li className="flex items-center gap-2">
                  <IconPin />
                  From {o.meeting_point}
                </li>
              )}
            </ul>
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
            className="flex items-center gap-4 rounded-card border border-border p-4 hover:shadow-card"
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

          <section>
            <p className="text-ink">{o.summary}</p>
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
                <ExperienceSplit
                  amounts={{
                    guide: pricing.lines[0].amountUsdCents,
                    permits: pricing.lines[1].amountUsdCents,
                    porters: pricing.lines[2].amountUsdCents,
                    logistics: pricing.lines[3].amountUsdCents,
                    trek: pricing.lines[4].amountUsdCents,
                    fund: pricing.lines[5].amountUsdCents,
                  }}
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

              {/* Budget recomposer (§1c): drag to a budget; the package
                  recomposes to hit it, showing exactly what changed. */}
              {selected && maxP > minP && (
                <div className="mt-5 border-t border-line pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink">Set your budget</span>
                    <span className="font-mono text-sm text-ink">
                      {m(selected.perPersonUsdCents)}/person
                    </span>
                  </div>
                  <input
                    type="range"
                    min={minP}
                    max={maxP}
                    step={100}
                    value={target}
                    onChange={(e) => setBudgetTarget(Number(e.target.value))}
                    className="mt-2 w-full accent-moss"
                    aria-label="Budget per person"
                  />
                  <div className="mt-1 flex justify-between text-xs text-muted">
                    <span className="font-mono">{m(minP)}</span>
                    <span className="font-mono">{m(maxP)}</span>
                  </div>
                  <p className="mt-2 text-sm text-ink">
                    {TEAHOUSE_LABEL[selected.tier]} · {selected.porter ? "with porter" : "no porter"}
                  </p>
                  {(teahouseDelta < 0 || porterDelta < 0) && (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted">
                      {teahouseDelta < 0 && (
                        <li>
                          {TEAHOUSE_LABEL[selected.tier].toLowerCase()}{" "}
                          <span className="font-mono text-pine">−{m(-teahouseDelta)}</span>
                        </li>
                      )}
                      {porterDelta < 0 && (
                        <li>
                          no porter <span className="font-mono text-pine">−{m(-porterDelta)}</span>
                        </li>
                      )}
                    </ul>
                  )}
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
                This is the whole package. Permits, porters and logistics are
                per person; the guide fee is shared across your group; add-ons are partner services
                we take no cut of. The Fund line?{" "}
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

          {(o.included?.length || o.excluded?.length) ? (
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
          ) : null}

          {o.meeting_point && (
            <section>
              <h3 className="mb-1 font-medium">Meeting point</h3>
              <p className="text-sm text-ink-soft">{o.meeting_point}</p>
            </section>
          )}

          {/* ── When this trip can actually run. The guide's profile had a
               calendar and this page had a dropdown, so a reader could see
               "76 open days" in one place and eight dates in the other with
               nothing explaining the difference. Both are here now, and the
               difference is labelled. */}
          <section id="availability" className="scroll-mt-6">
            <h2 className="font-display text-xl">When you can go</h2>
            <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-1 text-sm">
              {availability?.nextStart && (
                <div className="flex gap-2">
                  <dt className="text-muted">Earliest start</dt>
                  <dd className="font-mono text-ink">{fmtDate(availability.nextStart)}</dd>
                </div>
              )}
              {availability?.nextRun && (
                <div className="flex gap-2">
                  <dt className="text-muted">{o.guide_name.split(" ")[0]} is next free</dt>
                  <dd className="font-mono text-ink">{runWords(availability.nextRun)}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-muted">Start days, next 3 months</dt>
                <dd className="font-mono text-ink">{availability?.startableSoon ?? 0}</dd>
              </div>
            </dl>
            {startableNote(span ?? 1, availability?.openSoon ?? 0, availability?.startableSoon ?? 0) && (
              <p className="mt-2 max-w-[62ch] text-sm text-ink-soft">
                {startableNote(span ?? 1, availability.openSoon, availability.startableSoon)}
              </p>
            )}
            <div className="mt-4">
              <AvailabilityCalendar
                openDays={openDays ?? []}
                startDays={availableDays}
                monthsFrom={monthAnchor ?? `${new Date().toISOString().slice(0, 7)}-01`}
                months={3}
              />
            </div>
            {availableDays.length === 0 && (
              <p className="mt-3 rounded-card bg-surface p-3 text-sm text-ink-soft">
                No start dates are open for this trip yet. Message{" "}
                {o.guide_name.split(" ")[0]} — a guide can open days for you.
              </p>
            )}

            {/* Directly under the calendar, because the two questions a reader
                has once they have picked a day are what they pay now and what
                happens if they cannot come. Both were inside the booking card,
                which on a phone is a sheet behind a tap. */}
            <PaymentTerms
              totalUsdCents={partyTotalUsdCents}
              day={day}
              today={today ?? new Date().toISOString().slice(0, 10)}
              className="mt-5"
            />
          </section>

          {/* ── How you move. Every page we are compared with has this row
               and ours had none, so "is there a flight, and is it in the
               price?" was a message to the guide. */}
          {(transportLabels((o as any).transport).length > 0 ||
            (o as any).transport_note) && (
            <section>
              <h2 className="font-display text-xl">Getting there and around</h2>
              {transportLabels((o as any).transport).length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
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

          {/* ── The facts a reader checks last and cancels over: how hard,
               what language, whether their knee or their mother can come, and
               a reference to put in an email. */}
          <OtherDetails
            o={o}
            languages={tripLanguages((o as any).languages, guideLanguages)}
          />

          {/* ── The questions the office answers by email every week. Also
               FAQPage structured data, in the route's meta. */}
          {parseFaqs((o as any).faqs).length > 0 && (
            <section id="faq" className="scroll-mt-6">
              <h2 className="font-display text-xl">Questions people ask</h2>
              <ul className="mt-3 divide-y divide-line rounded-card border border-line">
                {parseFaqs((o as any).faqs).map((f) => (
                  <li key={f.q}>
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-3 font-medium text-ink hover:bg-mist/50">
                        {f.q}
                        <span
                          aria-hidden
                          className="mt-0.5 shrink-0 text-muted transition-transform group-open:rotate-180"
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
            <section className="space-y-4">
              <h2 className="font-display text-xl">Reviews</h2>
              {/* The spread, not just the mean: a reader deciding between two
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
          offering={widgetOffering}
          priceBreakdown={effBreakdown ?? breakdown}
          addonsPerPerson={addonsPP}
          selectedOptions={options.filter((a) => addons.has(a.id)).map((a) => a.id)}
          party={party}
          setParty={setParty}
          day={day}
          setDay={setDay}
          availableDays={availableDays}
          returnTo={data.canonical ? new URL(data.canonical).pathname : "/"}
        />
      </div>

      {/* ── Two rails, because a reader who likes this guide but not this trip
           had nowhere to go from here, and one who likes the trip could not
           see who else runs it. Every page we are compared with ends with
           both. */}
      {moreByGuide?.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-2xl text-ink">
            More from {o.guide_name.split(" ")[0]}
          </h2>
          <p className="mt-1 text-sm text-muted">
            The same guide, a different trip. Same rate, same calendar.
          </p>
          <Rail>
            {moreByGuide.map((x: any) => (
              <OfferingCard key={x.id} offering={x} rating={railRatings?.[x.id]} />
            ))}
          </Rail>
        </section>
      )}

      {similar?.length > 0 && (
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
          <Rail>
            {similar.map((x: any) => (
              <OfferingCard key={x.id} offering={x} rating={railRatings?.[x.id]} />
            ))}
          </Rail>
        </section>
      )}
    </main>
  );
}


/**
 * The row of ordinary fact a trip page is expected to carry.
 *
 * On the pages a trekker compares us with this is a plain labelled block near
 * the foot: how hard it is, what your guide will speak on the day, who the
 * trip suits, a reference to quote. Ours had none of it, so every one of those
 * questions arrived as a message — and "not suitable if you have limited
 * mobility" arrived after somebody had paid.
 */
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
            <dt className="text-caption uppercase tracking-wide text-muted">How hard it is</dt>
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
            <dt className="text-caption uppercase tracking-wide text-muted">
              Languages on the trip
            </dt>
            <dd className="mt-0.5 text-ink">{languages.join(", ")}</dd>
          </div>
        )}

        {access.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="text-caption uppercase tracking-wide text-muted">Who it suits</dt>
            <dd className="mt-1">
              <ul className="space-y-1 text-sm">
                {access.map((a) => (
                  <li key={a.label} className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className={a.warn ? "text-ember" : "text-moss"}
                    >
                      {a.warn ? "!" : "✓"}
                    </span>
                    <span className={a.warn ? "text-ink" : "text-ink-soft"}>{a.label}</span>
                  </li>
                ))}
              </ul>
              {o.accessibility_note && (
                <p className="mt-2 max-w-[62ch] text-sm text-ink-soft">
                  {o.accessibility_note}
                </p>
              )}
            </dd>
          </div>
        )}

        {ref && (
          <div>
            <dt className="text-caption uppercase tracking-wide text-muted">
              Trip reference
            </dt>
            {/* Quote this in an email and the office finds the trip in one
                search, instead of asking which Everest trek you mean. */}
            <dd className="mt-0.5 font-mono text-ink">{ref}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

/** "2026-09-08|2026-09-10" → "8–10 Sep". */
function runWords(run: string): string {
  const [a, b] = run.split("|");
  const mon = new Date(`${b}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const dayA = Number(a.slice(8, 10));
  const dayB = Number(b.slice(8, 10));
  return `${dayA}–${dayB} ${mon}`;
}


const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  className: "shrink-0 text-muted",
};

function IconClock() {
  return (
    <svg {...iconProps}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 1.6" />
    </svg>
  );
}

function IconPeople() {
  return (
    <svg {...iconProps}>
      <circle cx="7.5" cy="7.5" r="2.6" />
      <path d="M3 16c0-2.3 2-3.8 4.5-3.8S12 13.7 12 16" />
      <path d="M13.5 6.4a2.4 2.4 0 0 1 0 4.5M14.5 12.6c1.7.4 2.9 1.6 2.9 3.4" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg {...iconProps}>
      <path d="M10 17s5-4.4 5-8a5 5 0 0 0-10 0c0 3.6 5 8 5 8Z" />
      <circle cx="10" cy="9" r="1.8" />
    </svg>
  );
}
