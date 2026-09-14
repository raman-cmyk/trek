import { useMemo, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/Button";
import { Sheet } from "~/components/Sheet";
import { PriceBreakdown } from "./bits";
import { computePricing } from "~/lib/pricing";
import { computeExperiencePricing, type PriceBreakdown as PB , hasBreakdown } from "~/lib/experience-pricing";
import { useMoney } from "~/lib/currency-context";
import { TrustPanel } from "~/components/public/TrustPanel";
import { fmtDate } from "~/lib/format";
import { DatePicker } from "~/components/DatePicker";
import { ENQUIRY_TTL_HOURS } from "~/lib/config";
import {
  REFUND_BANDS,
  REFUND_IF_NOT_YOU,
  balanceLine,
  depositLine,
  fullPaymentReason,
  paymentPlan,
} from "~/lib/payment-policy";

export interface BookingWidgetOffering {
  id: string;
  guide_id: string;
  kind: string;
  days: number;
  price_usd_cents: number | null;
  min_party: number;
  max_party: number;
  guide_day_rate_usd_cents: number | null;
  permit_fees_pp_usd_cents: number;
  guide_first_name: string;
}

function fmtDay(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

interface QuoteResult {
  headline: number; // per person when breakdown-priced, else party total
  perPerson: boolean;
  rows: { label: string; usdCents: number }[] | null; // legacy rows, or null when the full Split is shown on-page
}

function useQuote(
  o: BookingWidgetOffering,
  party: number,
  breakdown?: PB | null,
  addonsPerPerson = 0,
  startDate?: string | null,
): QuoteResult | null {
  return useMemo(() => {
    // v3: an experience with a price_breakdown is priced from the breakdown
    // (shown in full on the page); the widget just states the per-person price.
    if (hasBreakdown(breakdown)) {
      const p = computeExperiencePricing(breakdown, party, startDate);
      return { headline: p.perPersonUsdCents + addonsPerPerson, perPerson: true, rows: null };
    }
    const isMultiDay = o.kind === "trek";
    try {
      const p = computePricing({
        isMultiDay,
        partySize: party,
        fxRateNpr: 133, // trekker total is fx-independent
        days: o.days,
        dayRateUsdCents: o.guide_day_rate_usd_cents ?? 0,
        permitFeesPerPersonUsdCents: o.permit_fees_pp_usd_cents,
        offeringPriceUsdCents: o.price_usd_cents ?? 0,
      });
      const rows = [
        { label: isMultiDay ? "Guide fee" : "Experience", usdCents: p.guideFeeUsdCents },
        ...(p.permitFeesUsdCents ? [{ label: "Permits", usdCents: p.permitFeesUsdCents }] : []),
        { label: "Service fee", usdCents: p.serviceFeeUsdCents },
        ...(p.permitHandlingUsdCents
          ? [{ label: "Permit handling", usdCents: p.permitHandlingUsdCents }]
          : []),
      ];
      return { headline: p.totalUsdCents, perPerson: false, rows };
    } catch {
      return null;
    }
  }, [o, party, breakdown, addonsPerPerson]);
}

function ConfigBody({
  o,
  breakdown,
  addonsPerPerson,
  selectedOptions = [],
  availableDays,
  party,
  setParty,
  day,
  setDay,
  returnTo,
}: {
  o: BookingWidgetOffering;
  breakdown?: PB | null;
  addonsPerPerson?: number;
  /** Ids of the guide's optional lines the trekker ticked. */
  selectedOptions?: string[];
  availableDays: string[];
  party: number;
  setParty: (n: number) => void;
  day: string;
  setDay: (d: string) => void;
  returnTo: string;
}) {
  const quote = useQuote(o, party, breakdown, addonsPerPerson);
  const { m } = useMoney();
  const fetcher = useFetcher();
  const sent = fetcher.data?.ok;
  const busy = fetcher.state !== "idle";
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm text-ink-soft">Date</span>
        <select
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="mt-1 w-full rounded-button border border-border px-3 py-2"
        >
          {availableDays.slice(0, 40).map((d) => (
            <option key={d} value={d}>
              {fmtDay(d)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-soft">Party size</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Fewer"
            onClick={() => setParty(Math.max(o.min_party, party - 1))}
            className="h-8 w-8 rounded-full border border-border text-lg leading-none hover:border-ink-soft"
          >
            −
          </button>
          <span className="w-6 text-center font-medium">{party}</span>
          <button
            type="button"
            aria-label="More"
            onClick={() => setParty(Math.min(o.max_party, party + 1))}
            className="h-8 w-8 rounded-full border border-border text-lg leading-none hover:border-ink-soft"
          >
            +
          </button>
        </div>
      </div>

      {quote?.rows ? (
        <PriceBreakdown rows={quote.rows} total={quote.headline} />
      ) : quote ? (
        <p className="text-sm text-ink-soft">
          <span className="font-mono font-medium text-ink">{m(quote.headline)}</span> per
          person · full breakdown above · {party} {party === 1 ? "person" : "people"}
        </p>
      ) : null}

      {/* What you actually pay, and when. The page priced the trip to the
          rupee and then said nothing about the deposit until checkout — so a
          guest could not find out what percentage they were committing to,
          which is the question everybody asks before they send anything. */}
      {quote && day && <PaymentPolicy totalUsdCents={quote.headline * (quote.perPerson ? party : 1)} day={day} />}

      {availableDays.length === 0 ? (
        <p className="rounded-button bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No open dates right now — message {o.guide_first_name} above and they can
          open their calendar for you.
        </p>
      ) : sent ? (
        <p className="rounded-button bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Request sent to {o.guide_first_name}. They have {ENQUIRY_TTL_HOURS} hours
          to reply — we’ll email you.
        </p>
      ) : (
        <fetcher.Form method="post" action="/enquiry">
          <input type="hidden" name="offering_id" value={o.id} />
          <input type="hidden" name="guide_id" value={o.guide_id} />
          <input type="hidden" name="start_date" value={day} />
          <input type="hidden" name="party_size" value={party} />
          <input type="hidden" name="return_to" value={returnTo} />
          {/* What they ticked travels with the request. The guide answers the
              trip somebody actually asked for, not the listing's default. */}
          <input
            type="hidden"
            name="selected_options"
            value={JSON.stringify(selectedOptions)}
          />
          {/* A trek starts in the mountains, not at the airport: the guide
              plans the briefing and the domestic flight around the day you
              land. Optional, because most people book the trek first. */}
          {o.kind === "trek" && (
            <label className="mb-2 block text-sm text-ink-soft">
              When do you land in Kathmandu? <span className="text-muted">(if you know)</span>
              <DatePicker
                name="arrival_date"
                today={new Date().toISOString().slice(0, 10)}
                max={day}
                label="When you land in Kathmandu"
                placeholder="Not booked yet"
                className="mt-1"
                inputClassName="w-full rounded-button border border-border px-3 py-2 text-base text-ink"
              />
            </label>
          )}
          <textarea
            name="message"
            rows={2}
            placeholder={`Message ${o.guide_first_name} (optional)`}
            className="mb-2 w-full rounded-button border border-border px-3 py-2 text-sm"
          />
          {fetcher.data?.error && (
            <p className="mb-2 text-sm text-danger">{fetcher.data.error}</p>
          )}
          <Button type="submit" loading={busy} disabled={!day} className="w-full">
            Request to book
          </Button>
        </fetcher.Form>
      )}
      {/* Sending dates is the first irreversible-feeling step, and until now
          the page said nothing about what it costs or commits you to. It
          costs nothing and commits you to nothing, which is worth saying at
          the exact moment somebody hesitates. */}
      <TrustPanel
        className="mt-3"
        title="What happens when you send this"
        items={[
          {
            label: `${o.guide_first_name} reads it and replies within ${ENQUIRY_TTL_HOURS} hours.`,
            note: "You talk first. Your card is not asked for until you both agree.",
          },
          {
            label: "Your dates are held while they answer.",
            note: "Nobody else can book those days out from under you.",
          },
          {
            label: "Cancel 30 or more days before and you get it all back.",
            note: "Except the card fee, which the bank keeps. Closer in, less comes back — the exact bands are above.",
          },
        ]}
      />
    </div>
  );
}

export function BookingWidget({
  offering,
  priceBreakdown,
  addonsPerPerson = 0,
  selectedOptions = [],
  party,
  setParty,
  day,
  setDay,
  availableDays,
  returnTo,
}: {
  offering: BookingWidgetOffering;
  priceBreakdown?: PB | null;
  addonsPerPerson?: number;
  /** Ids of the guide's optional lines the trekker ticked. */
  selectedOptions?: string[];
  party: number;
  setParty: (n: number) => void;
  /** Lifted, like the party size: the itemised breakdown on the page has to
      be priced on the same date this widget is going to book. */
  day: string;
  setDay: (d: string) => void;
  availableDays: string[];
  returnTo: string;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const quote = useQuote(offering, party, priceBreakdown, addonsPerPerson, day);
  const { m } = useMoney();
  const unit = quote?.perPerson
    ? "per person"
    : offering.kind === "trek"
      ? `${offering.days} days`
      : "per person";

  return (
    <>
      {/* Desktop: sticky right-rail card */}
      <aside className="sticky top-24 hidden rounded-card border border-border bg-card p-5 shadow-card lg:block">
        <p className="mb-3">
          <span className="font-mono text-2xl font-medium">
            {quote ? m(quote.headline) : "—"}
          </span>
          <span className="text-ink-soft"> · {unit}</span>
        </p>
        <ConfigBody
          o={offering}
          breakdown={priceBreakdown}
          addonsPerPerson={addonsPerPerson}
          selectedOptions={selectedOptions}
          availableDays={availableDays}
          party={party}
          setParty={setParty}
          day={day}
          setDay={setDay}
          returnTo={returnTo}
        />
      </aside>

      {/* Mobile: fixed bottom price bar → bottom sheet */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card p-3 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <span className="font-mono font-medium">
              {quote ? m(quote.headline) : "—"}
            </span>
            <span className="text-ink-soft"> · {unit}</span>
          </div>
          <Button onClick={() => setSheetOpen(true)}>Request to book</Button>
        </div>
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Your trip">
        <ConfigBody
          o={offering}
          breakdown={priceBreakdown}
          addonsPerPerson={addonsPerPerson}
          selectedOptions={selectedOptions}
          availableDays={availableDays}
          party={party}
          setParty={setParty}
          day={day}
          setDay={setDay}
          returnTo={returnTo}
        />
      </Sheet>
    </>
  );
}

/**
 * The money terms, before anybody commits to anything.
 *
 * Three sentences and the bands: what is taken now, what is taken later and
 * when, and what comes back if the trip does not happen. Priced for the date
 * and party actually selected, because "20% of what?" is the whole question.
 */
function PaymentPolicy({ totalUsdCents, day }: { totalUsdCents: number; day: string }) {
  const { m } = useMoney();
  const today = new Date().toISOString().slice(0, 10);
  const plan = paymentPlan({ totalUsdCents, startDate: day, today });
  const balance = balanceLine(plan, m, fmtDate);
  const why = fullPaymentReason(plan);
  return (
    <details className="rounded-button border border-border bg-paper px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium text-ink">
        {depositLine(plan, m)}
      </summary>
      <div className="mt-2 space-y-2 text-ink-soft">
        {balance && <p>{balance}</p>}
        {why && <p>{why}</p>}
        <div>
          <p className="font-medium text-ink">If you cancel</p>
          <ul className="mt-1 space-y-0.5">
            {REFUND_BANDS.map((b) => (
              <li key={b.when}>
                {b.when}: <span className="text-ink">{b.youGetBack}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5">{REFUND_IF_NOT_YOU}</p>
        </div>
      </div>
    </details>
  );
}
