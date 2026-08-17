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
import { STANDARD_ADDONS, addonsTotalUsdCents } from "~/lib/addons";
import { useMoney } from "~/lib/currency-context";

export function OfferingDetailView({ data }: { data: OfferingDetailData }) {
  const { o, photos, availableDays, reviews, rating, permitPp } = data;
  const { m, code } = useMoney();
  const breakdown = (o.price_breakdown ?? null) as PriceBreakdown | null;
  const showBreakdown = hasBreakdown(breakdown);
  const [party, setParty] = useState(o.min_party || 1);
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
  // Priced on the date the booking widget starts on, so the itemised list a
  // reader is looking at is the one they will be charged. Changing the date
  // inside the widget does not yet move this list — noted, and the reason the
  // day state wants lifting out of the widget.
  const priceDate = availableDays[0] ?? null;
  const pricing = effBreakdown
    ? computeExperiencePricing(effBreakdown, party, priceDate)
    : null;
  const addonsPP = addonsTotalUsdCents(addons);
  const grandPP = pricing ? pricing.perPersonUsdCents + addonsPP : null;
  // Exact, sequential per-lever deltas vs the full comfort package (they sum).
  const afterTeahouse =
    selected && showBreakdown
      ? computeExperiencePricing(
          recompose(breakdown!, { tier: selected.tier, porter: true }),
          party,
          availableDays[0] ?? null,
        ).perPersonUsdCents
      : 0;
  const teahouseDelta = afterTeahouse - maxP;
  const porterDelta = selected ? selected.perPersonUsdCents - afterTeahouse : 0;
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
      <Carousel photos={carousel} />

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

              {/* Add-ons — each is a line, nothing hidden (§1b). */}
              <div className="mt-4 space-y-2 border-t border-line pt-4">
                {STANDARD_ADDONS.map((a) => (
                  <label key={a.key} className="flex cursor-pointer items-start justify-between gap-3">
                    <span>
                      <span className="text-sm font-medium text-ink">{a.label}</span>
                      <span className="mt-0.5 block text-xs text-muted">{a.note}</span>
                    </span>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <span className="font-mono text-sm text-ink">+{m(a.amountUsdCents)}</span>
                      <input type="checkbox" checked={addons.has(a.key)} onChange={() => toggleAddon(a.key)} />
                    </span>
                  </label>
                ))}
              </div>

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
          priceBreakdown={effBreakdown ?? breakdown}
          addonsPerPerson={addonsPP}
          party={party}
          setParty={setParty}
          availableDays={availableDays}
          returnTo={data.canonical ? new URL(data.canonical).pathname : "/"}
        />
      </div>
    </main>
  );
}
