import { fmtDate } from "~/lib/format";
import { useMoney } from "~/lib/currency-context";
import {
  CANCELLATION_TEASER,
  REFUND_BANDS,
  REFUND_IF_NOT_YOU,
  balanceLine,
  depositLine,
  depositTeaser,
  fullPaymentReason,
  paymentPlan,
} from "~/lib/payment-policy";

/**
 * The deposit and the cancellation policy, below the calendar, on every page.
 *
 * Both of these existed only inside the booking card, folded into one closed
 * summary — so the deposit was findable if you opened it and the refund bands
 * were findable if you opened it and then read to the bottom. On a phone the
 * card is a bottom sheet, which put the whole thing behind a tap that nobody
 * takes before they have decided.
 *
 * Two rows, each priced for the date and party on screen, each opening in
 * place. Server-rendered `<details>` with no JavaScript in them: with scripts
 * off both still open (CLAUDE.md rule 5).
 */
export function PaymentTerms({
  totalUsdCents,
  day,
  today,
  className,
}: {
  /** The party total for the selected date, in cents. */
  totalUsdCents: number;
  /** The selected start date, ISO. */
  day: string;
  /** Today, from the server, so the plan is the same on both renders. */
  today: string;
  className?: string;
}) {
  const { m } = useMoney();
  if (!day || !totalUsdCents) return null;
  const plan = paymentPlan({ totalUsdCents, startDate: day, today });
  const balance = balanceLine(plan, m, fmtDate);
  const why = fullPaymentReason(plan);

  return (
    <section id="terms" className={className}>
      <ul className="divide-y divide-line rounded-card border border-line">
        <Row
          icon={<IconCard />}
          title={plan.fullUpfront ? "Paying for this trip" : "Book with a deposit"}
          teaser={depositTeaser(plan, m, fmtDate)}
        >
          <p>{depositLine(plan, m)}</p>
          {balance && <p>{balance}</p>}
          {why && <p>{why}</p>}
          <p>
            Nothing is taken until your guide accepts. The card is only charged once
            they have said yes.
          </p>
        </Row>

        <Row
          icon={<IconShield />}
          title="View our cancellation policy"
          teaser={CANCELLATION_TEASER}
        >
          <ul className="space-y-1">
            {REFUND_BANDS.map((b) => (
              <li key={b.when} className="flex flex-wrap gap-x-2">
                <span className="text-muted">{b.when}:</span>
                <span className="text-ink">{b.youGetBack}</span>
              </li>
            ))}
          </ul>
          <p>{REFUND_IF_NOT_YOU}</p>
        </Row>
      </ul>
    </section>
  );
}

/** One row: icon, title, one line of substance, and the rest on a tap. */
function Row({
  icon,
  title,
  teaser,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  teaser: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 p-3 hover:bg-mist/50">
          <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-ink underline decoration-line underline-offset-2">
              {title}
            </span>
            <span className="block text-sm text-ink-soft">{teaser}</span>
          </span>
          <span
            aria-hidden
            className="mt-1 shrink-0 text-muted transition-transform group-open:rotate-180"
          >
            ⌄
          </span>
        </summary>
        <div className="space-y-2 px-3 pb-3 pl-12 text-sm text-ink-soft">{children}</div>
      </details>
    </li>
  );
}

function IconShield() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function IconCard() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
    </svg>
  );
}
