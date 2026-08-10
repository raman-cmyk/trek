import { useMemo, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/Button";
import { Sheet } from "~/components/Sheet";
import { PriceBreakdown } from "./bits";
import { computePricing, formatUsd } from "~/lib/pricing";
import { computeExperiencePricing, type PriceBreakdown as PB } from "~/lib/experience-pricing";

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

function useQuote(o: BookingWidgetOffering, party: number, breakdown?: PB | null): QuoteResult | null {
  return useMemo(() => {
    // v3: an experience with a price_breakdown is priced from the breakdown
    // (shown in full on the page); the widget just states the per-person price.
    if (breakdown?.guide_fee_total_usd_cents) {
      const p = computeExperiencePricing(breakdown, party);
      return { headline: p.perPersonUsdCents, perPerson: true, rows: null };
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
  }, [o, party, breakdown]);
}

function ConfigBody({
  o,
  breakdown,
  availableDays,
  party,
  setParty,
  day,
  setDay,
  returnTo,
}: {
  o: BookingWidgetOffering;
  breakdown?: PB | null;
  availableDays: string[];
  party: number;
  setParty: (n: number) => void;
  day: string;
  setDay: (d: string) => void;
  returnTo: string;
}) {
  const quote = useQuote(o, party, breakdown);
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
          <span className="font-mono font-medium text-ink">{formatUsd(quote.headline)}</span> per
          person · full breakdown above · {party} {party === 1 ? "person" : "people"}
        </p>
      ) : null}

      {sent ? (
        <p className="rounded-button bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Request sent to {o.guide_first_name}. They have 24 hours to reply — we’ll
          email you.
        </p>
      ) : (
        <fetcher.Form method="post" action="/enquiry">
          <input type="hidden" name="offering_id" value={o.id} />
          <input type="hidden" name="guide_id" value={o.guide_id} />
          <input type="hidden" name="start_date" value={day} />
          <input type="hidden" name="party_size" value={party} />
          <input type="hidden" name="return_to" value={returnTo} />
          <textarea
            name="message"
            rows={2}
            placeholder={`Message ${o.guide_first_name} (optional)`}
            className="mb-2 w-full rounded-button border border-border px-3 py-2 text-sm"
          />
          {fetcher.data?.error && (
            <p className="mb-2 text-sm text-danger">{fetcher.data.error}</p>
          )}
          <Button type="submit" loading={busy} className="w-full">
            Request to book
          </Button>
        </fetcher.Form>
      )}
      <p className="text-center text-xs text-ink-soft">
        Free cancellation until 30 days before
      </p>
    </div>
  );
}

export function BookingWidget({
  offering,
  priceBreakdown,
  party,
  setParty,
  availableDays,
  returnTo,
}: {
  offering: BookingWidgetOffering;
  priceBreakdown?: PB | null;
  party: number;
  setParty: (n: number) => void;
  availableDays: string[];
  returnTo: string;
}) {
  const [day, setDay] = useState(availableDays[0] ?? "");
  const [sheetOpen, setSheetOpen] = useState(false);
  const quote = useQuote(offering, party, priceBreakdown);
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
            {quote ? formatUsd(quote.headline) : "—"}
          </span>
          <span className="text-ink-soft"> · {unit}</span>
        </p>
        <ConfigBody
          o={offering}
          breakdown={priceBreakdown}
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
              {quote ? formatUsd(quote.headline) : "—"}
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
