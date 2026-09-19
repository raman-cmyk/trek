import { useEffect, useMemo, useState } from "react";
import { cn } from "~/lib/cn";
import { askNotice } from "~/lib/standing-ask";
import { useFetcher } from "react-router";
import { Button } from "~/components/Button";
import { Sheet } from "~/components/Sheet";
import { PriceBreakdown } from "./bits";
import { computePricing } from "~/lib/pricing";
import { computeExperiencePricing, type PriceBreakdown as PB , hasBreakdown } from "~/lib/experience-pricing";
import { useMoney } from "~/lib/currency-context";
import { TrustPanel } from "~/components/public/TrustPanel";
import { previewTrack } from "~/lib/pipeline";
import { depositLine, freeCancellationLine } from "~/lib/policy-copy";
import { Link } from "react-router";
import { AvailabilityCalendar } from "~/components/public/AvailabilityCalendar";
import {
  daysLabel,
  firstTakenDay,
  formatSpan,
  monthInView,
  monthStart,
  shiftMonth,
  spanDays,
  spanEnd,
} from "~/lib/date-span";

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
  /** Used to search for other guides running the same thing after a decline. */
  title?: string;
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
    // `startDate` belongs here: a breakdown can price a season differently,
    // so leaving it out let the headline keep yesterday's date's price.
  }, [o, party, breakdown, addonsPerPerson, startDate]);
}

/**
 * Pick your dates on the calendar, not out of a dropdown.
 *
 * "I should be able to select the dates I want to go on a trek before
 * clicking request to book, so I can have a visual representation on the
 * trek's timeline." A list of start dates cannot show you that a twelve-day
 * walk from the 20th runs to the 31st, or that the guide is booked on the
 * 27th of it — and until now nothing stopped you asking for exactly that.
 *
 * One month at a time, because this sits in a 320px rail and in a phone
 * sheet. The arrows move it; the trip length comes from the offering, so the
 * span paints itself.
 */
function DatePick({
  o,
  availableDays,
  day,
  setDay,
  requestedDays,
}: {
  o: BookingWidgetOffering;
  availableDays: string[];
  day: string;
  setDay: (d: string) => void;
  /** Days already asked about and not yet answered. */
  requestedDays?: string[];
}) {
  const days = Math.max(1, o.days || 1);

  /**
   * Which month is on screen.
   *
   * Held, not derived. It used to be `month(chosen day) + a paging offset`,
   * which meant every click moved the thing the offset was measured from:
   * page forward three months, pick a date, and you landed three months past
   * it. Picking a day in the second panel of a span that crosses a month did
   * the same thing one month at a time — Dec, Jan, Feb, off into next year.
   *
   * So the view only moves when somebody moves it. The one exception is
   * below: a date arriving from anywhere other than a click, which nobody
   * can see happen.
   */
  const firstOpen = availableDays[0] || new Date().toISOString().slice(0, 10);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(day || firstOpen));
  const end = day ? spanEnd(day, days) : "";
  // Only possible for a date chosen before this component existed, or one
  // that was free when the page loaded and is not now.
  const clash = day ? firstTakenDay(day, days, availableDays) : null;

  // Show the second month when the trip runs into it. The whole point is
  // seeing the walk on a calendar; "20 Sep – 1 Oct" with only September on
  // screen shows two thirds of the answer.
  const showMonths = end && end.slice(0, 7) !== visibleMonth.slice(0, 7) ? 2 : 1;

  // A start date that is not on screen, set by something other than a click
  // — a fresh page, a group's dates. Follow it; otherwise stay put.
  useEffect(() => {
    if (day && !monthInView(day, visibleMonth, showMonths)) {
      setVisibleMonth(monthStart(day));
    }
  }, [day, visibleMonth, showMonths]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm text-ink-soft">
          {day ? "Your dates" : days > 1 ? "Pick your first day" : "Pick a date"}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setVisibleMonth((m) => shiftMonth(m, -1))}
            className="rounded px-2 py-0.5 text-sm text-ink-soft hover:bg-mist hover:text-ink"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setVisibleMonth((m) => shiftMonth(m, 1))}
            className="rounded px-2 py-0.5 text-sm text-ink-soft hover:bg-mist hover:text-ink"
          >
            ›
          </button>
        </span>
      </div>

      <AvailabilityCalendar
        openDays={availableDays}
        monthsFrom={visibleMonth}
        months={showMonths}
        guideName={o.guide_first_name}
        compact
        select="span"
        days={days}
        value={{ start: day || null, end: end || null }}
        requestedDays={requestedDays}
        onPick={(next) => next.start && setDay(next.start)}
      />

      {/* The chosen span said in words as well as colour, because a shaded
          row of squares is not something you can read back to yourself to
          check. */}
      {day && (
        <p className="mt-2 text-sm">
          <span className="font-medium text-ink">{formatSpan(day, end)}</span>
          <span className="text-ink-soft"> · {daysLabel(days)}</span>
        </p>
      )}
      {clash && (
        <p className="mt-1 text-sm text-danger">
          {o.guide_first_name} is not free on {fmtDay(clash)} — pick another start.
        </p>
      )}
    </div>
  );
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
  standing,
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
  standing?: {
    status: string;
    startDate: string;
    expiresAt: string | null;
    bookingStatus: string | null;
  } | null;
}) {
  const quote = useQuote(o, party, breakdown, addonsPerPerson, day);
  const { m } = useMoney();
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";

  /**
   * What we already know about this trekker and this trip.
   *
   * The database first, because it is the version that survives a refresh.
   * The fetcher only overrides it for the second between the request landing
   * and the page revalidating — without that the button would appear to do
   * nothing on a slow connection, which is exactly the population this has
   * to work for.
   */
  const notice = fetcher.data?.ok
    ? {
        state: "waiting" as const,
        tone: "waiting" as const,
        text: fetcher.data?.booked
          ? `You already have this booked with ${o.guide_first_name} for these dates — it is in My trips.`
          : fetcher.data?.already
            ? `You already asked ${o.guide_first_name} about these dates — it is in My trips, waiting on them.`
            : `Request sent to ${o.guide_first_name}. It is in My trips until they answer, and we will email you.`,
        offerOtherDates: false,
        offerOtherGuides: false,
        canAskAgain: false,
      }
    : askNotice(
        standing
          ? {
              status: standing.status,
              startDate: standing.startDate,
              expiresAt: standing.expiresAt,
            }
          : null,
        standing?.bookingStatus ?? null,
        o.guide_first_name,
      );

  /**
   * The days they already asked about, marked on the calendar.
   *
   * Only while the request is genuinely live. Once the guide accepts, those
   * days become `held` in availability and drop out of `openDays` anyway; and
   * a request that ended — declined, expired, cancelled — is not something to
   * keep drawing on a calendar somebody is trying to pick new dates on.
   */
  const requestedDays =
    standing && (standing.status === "open" || standing.status === "quoted")
      ? spanDays(standing.startDate, o.days || 1)
      : undefined;

  return (
    <div className="space-y-4">
      <DatePick
        o={o}
        availableDays={availableDays}
        day={day}
        setDay={setDay}
        requestedDays={requestedDays}
      />

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

      {availableDays.length === 0 ? (
        /* A guide is free unless they say otherwise (app/lib/open-days.ts),
           so this now means what it says: {guide} has blocked or sold every
           day of the next year. It used to be the normal state of every guide
           who joined through the real application form, and it hid the
           request form from their own trek page. */
        <p className="rounded-button bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {o.guide_first_name} has no free days left this year — message them
          above and ask what they can do.
        </p>
      ) : notice.canAskAgain && notice.state !== "none" ? (
        /* The answer was no, or nobody answered. Say so, keep the guide, and
           put the next step in reach — then leave the form open underneath,
           because asking again after a no is a normal thing to do and the
           guards deliberately allow it. */
        <>
          <div className="rounded-button bg-mist px-3 py-2 text-sm text-ink-soft">
            <p>{notice.text}</p>
            {notice.offerOtherGuides && (
              /* A real search, not a dead end: /guides takes free-text that
                 already matches routes and trips, plus a date range. So this
                 asks the only question worth asking after a no — who else
                 runs this, and who is free then. */
              <Link
                to={`/guides?${new URLSearchParams({
                  ...(o.title ? { q: o.title } : {}),
                  ...(day ? { from: day, to: spanEnd(day, Math.max(1, o.days || 1)) } : {}),
                }).toString()}`}
                prefetch="intent"
                className="mt-1 inline-block font-medium text-moss underline underline-offset-4"
              >
                See who else runs this, free then →
              </Link>
            )}
          </div>
          <AskForm
            o={o}
            day={day}
            party={party}
            selectedOptions={selectedOptions}
            returnTo={returnTo}
            fetcher={fetcher}
            busy={busy}
            again
          />
        </>
      ) : notice.state !== "none" ? (
        <p
          className={cn(
            "rounded-button px-3 py-2 text-sm",
            notice.tone === "good"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-mist text-ink-soft",
          )}
        >
          {notice.text}
        </p>
      ) : (
        <AskForm
          o={o}
          day={day}
          party={party}
          selectedOptions={selectedOptions}
          returnTo={returnTo}
          fetcher={fetcher}
          busy={busy}
        />
      )}
      {/* Sending dates is the first irreversible-feeling step, and until now
          the page said nothing about what it costs or commits you to. It
          costs nothing and commits you to nothing, which is worth saying at
          the exact moment somebody hesitates. */}
      {/* What happens next, generated from the track this trip will actually
          run on (app/lib/pipeline.ts) rather than a second list written here.
          Two lists of steps maintained in two places is how a booking flow
          starts promising something the trip page then contradicts — and the
          steps genuinely differ: a trek files permits, a food tour sends an
          address.

          The first two items are the request itself, which no pipeline stage
          covers because it happens before there is a booking at all. */}
      {/* The free-cancellation period, stated where the thumb is. It says
          "free" because that is the word people are looking for, and says
          what is withheld in the same breath — a headline promise with the
          exception buried on another page is what turns a refund into a
          complaint. Both numbers come from the refund engine, so the page
          cannot promise something the code does not pay. */}
      <p className="mt-3 flex items-start gap-2 rounded-button border border-sage/50 bg-mist px-3 py-2.5">
        <TickMark />
        <span className="min-w-0">
          <Link
            to="/cancellation#refunds"
            className="text-sm font-medium text-pine underline underline-offset-4"
          >
            {freeCancellationLine().headline}
          </Link>
          <span className="mt-0.5 block text-caption text-ink-soft">
            {freeCancellationLine().detail}
          </span>
        </span>
      </p>

      {/* The two questions somebody asks with their thumb over the button,
          answered where they ask them rather than in a footer nobody opens.
          Both go to one page, because "can I get my money back" and "do I
          have to pay it all now" are the same worry asked twice. */}
      <ul className="mt-4 space-y-3 border-t border-border pt-4">
        <li className="flex items-start gap-2.5">
          <ShieldMark />
          <span className="min-w-0">
            <Link
              to="/cancellation#refunds"
              className="text-sm font-medium text-ink underline underline-offset-4 hover:text-moss"
            >
              View our cancellation policies
            </Link>
            <span className="mt-0.5 block text-caption text-muted">
              What you get back closer in, and what your guide is paid.
            </span>
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <CardMark />
          <span className="min-w-0">
            <Link
              to="/cancellation#deposit"
              className="text-sm font-medium text-ink underline underline-offset-4 hover:text-moss"
            >
              Book with a deposit
            </Link>
            <span className="mt-0.5 block text-caption text-muted">{depositLine()}</span>
          </span>
        </li>
      </ul>

      {/* Only while there is something to send. A person who has already
          booked, or who is waiting on an answer, was being told what happens
          when they send a request — a page explaining a step they are past. */}
      {(notice.state === "none" || notice.canAskAgain) && (
      <TrustPanel
        className="mt-3"
        title="What happens when you send this"
        items={[
          {
            label: `${o.guide_first_name} reads it and replies within 24 hours.`,
            note: "You talk first. Your card is not asked for until you both agree.",
          },
          {
            label: "If they say yes, your dates are held while you pay.",
            note: "Nothing is charged until then, and nothing commits you now.",
          },
          ...previewTrack(o.kind).map((s) => ({ label: s.label, note: s.hint })),
        ]}
      />
      )}
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
  standing,
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
  /**
   * What this trekker has already asked of this guide for this trip, read
   * from the database rather than from the last form submission — so it
   * survives a refresh, a new tab, and coming back tomorrow to check.
   */
  standing?: {
    status: string;
    startDate: string;
    expiresAt: string | null;
    bookingStatus: string | null;
  } | null;
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
      <aside className="sticky top-24 hidden rounded-photo border border-border bg-card p-5 shadow-card lg:block">
        <p className="mb-3">
          <span className="font-mono text-2xl font-medium">
            {quote ? m(quote.headline) : "—"}
          </span>
          <span className="text-ink-soft"> · {unit}</span>
        </p>
        <ConfigBody
          standing={standing}
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
          <Button variant="lime" onClick={() => setSheetOpen(true)}>Request to book</Button>
        </div>
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Your trip">
        <ConfigBody
          standing={standing}
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

function ShieldMark() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="mt-0.5 h-4.5 w-4.5 shrink-0 text-moss"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 2.5 4 4.8v4.4c0 3.4 2.4 6.5 6 8.3 3.6-1.8 6-4.9 6-8.3V4.8L10 2.5Z" />
      <path d="m7.6 9.9 1.7 1.7 3.2-3.4" />
    </svg>
  );
}

function CardMark() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="mt-0.5 h-4.5 w-4.5 shrink-0 text-moss"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <path d="M2.5 8.5h15" />
      <path d="M5.5 12.5h3" />
    </svg>
  );
}

function TickMark() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="mt-0.5 h-4.5 w-4.5 shrink-0 text-moss"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="10" cy="10" r="7.25" />
      <path d="m6.8 10.2 2.1 2.1 4.3-4.6" />
    </svg>
  );
}


/**
 * The request form, in one place.
 *
 * It is rendered twice: for a first ask, and again under a decline — because
 * asking a second time after a no is normal, and ask-guard is deliberately
 * written to allow it. Two copies of this markup would drift, and the copy
 * that drifted would be the one nobody tested.
 */
function AskForm({
  o,
  day,
  party,
  selectedOptions,
  returnTo,
  fetcher,
  busy,
  again = false,
}: {
  o: BookingWidgetOffering;
  day: string;
  party: number;
  selectedOptions: string[];
  returnTo: string;
  fetcher: ReturnType<typeof useFetcher<any>>;
  busy: boolean;
  again?: boolean;
}) {
  return (
    <fetcher.Form method="post" action="/enquiry" className={again ? "mt-3" : undefined}>
      <input type="hidden" name="offering_id" value={o.id} />
      <input type="hidden" name="guide_id" value={o.guide_id} />
      <input type="hidden" name="start_date" value={day} />
      <input type="hidden" name="party_size" value={party} />
      <input type="hidden" name="return_to" value={returnTo} />
      {/* What they ticked travels with the request. The guide answers the
          trip somebody actually asked for, not the listing's default. */}
      <input type="hidden" name="selected_options" value={JSON.stringify(selectedOptions)} />
      <textarea
        name="message"
        rows={2}
        placeholder={`Message ${o.guide_first_name} (optional)`}
        className="mb-2 w-full rounded-button border border-border px-3 py-2 text-sm"
      />
      {fetcher.data?.error && <p className="mb-2 text-sm text-danger">{fetcher.data.error}</p>}
      <Button type="submit" variant="lime" loading={busy} disabled={!day} className="w-full">
        {again ? "Ask about another date" : "Request to book"}
      </Button>
    </fetcher.Form>
  );
}
