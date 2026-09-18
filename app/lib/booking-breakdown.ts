/**
 * What a booking's total is actually made of, for the office.
 *
 * The money is already on the booking row — every component was snapshotted
 * at the moment the guide accepted, so a later change to an offering's price
 * cannot rewrite what somebody was charged. Nothing here re-prices anything;
 * it reads those columns and names them.
 *
 * Two things this has to get right, because getting them wrong is worse than
 * showing nothing:
 *
 * 1. `commission_usd_cents` and `service_fee_usd_cents` are the SAME money on
 *    an itemised booking. quote() writes the platform's cut into both, so
 *    listing both would show an $847.50 trek adding up to $922.50. On a
 *    legacy booking they are genuinely different — the service fee is charged
 *    to the trekker on top, the commission comes out of the guide's share —
 *    and then both belong on screen. Told apart by whether they are equal,
 *    which is exactly what distinguishes the two paths.
 *
 * 2. The lines must sum to the stored total, and when they do not the panel
 *    says so instead of drawing a tidy table. A breakdown that silently
 *    disagrees with the amount charged is how an office quotes a refund that
 *    does not match the receipt.
 */

export interface BookingMoney {
  guide_fee_usd_cents?: number | null;
  porter_fee_usd_cents?: number | null;
  permit_fees_usd_cents?: number | null;
  permit_handling_usd_cents?: number | null;
  logistics_usd_cents?: number | null;
  service_fee_usd_cents?: number | null;
  fund_usd_cents?: number | null;
  commission_usd_cents?: number | null;
  total_usd_cents?: number | null;
  deposit_usd_cents?: number | null;
  guide_payout_npr_paisa?: number | null;
  fx_rate_npr?: number | string | null;
}

export interface ChargeLine {
  key: string;
  label: string;
  /** What this line is for, when the name alone leaves a question. */
  note?: string;
  amountUsdCents: number;
}

const n = (v: number | null | undefined) => (typeof v === "number" && isFinite(v) ? v : 0);

/**
 * The lines the trekker was charged, in the order they were added up.
 *
 * Zero lines are dropped: a day tour has no porters and no permits, and six
 * rows of "$0.00" bury the three that matter.
 */
export function chargeLines(b: BookingMoney): ChargeLine[] {
  const service = n(b.service_fee_usd_cents);
  const all: ChargeLine[] = [
    { key: "guide", label: "Guide", note: "The guide's own fee", amountUsdCents: n(b.guide_fee_usd_cents) },
    { key: "porters", label: "Porters", amountUsdCents: n(b.porter_fee_usd_cents) },
    {
      key: "permits",
      label: "Permits",
      note: "TIMS and park entry, paid on to the government",
      amountUsdCents: n(b.permit_fees_usd_cents),
    },
    {
      key: "permit_handling",
      label: "Permit handling",
      note: "Filing them through the partner agency",
      amountUsdCents: n(b.permit_handling_usd_cents),
    },
    {
      key: "logistics",
      label: "Teahouse, food & logistics",
      amountUsdCents: n(b.logistics_usd_cents),
    },
    { key: "service", label: "Our fee", amountUsdCents: service },
    { key: "fund", label: "The Fund", amountUsdCents: n(b.fund_usd_cents) },
  ];
  return all.filter((l) => l.amountUsdCents !== 0);
}

export interface BookingBreakdown {
  lines: ChargeLine[];
  /** What the lines add up to. */
  sumUsdCents: number;
  /** What the booking says it charged. */
  totalUsdCents: number;
  /** Do those two agree? When false, show the warning, not the table. */
  balances: boolean;
  /** The gap, signed, when they do not. */
  driftUsdCents: number;
  /** Fixed at booking, in paisa — the guide is paid in rupees. */
  guidePayoutNprPaisa: number;
  fxRateNpr: number;
  /** Only when it is money separate from the fee above (see the note). */
  commissionUsdCents: number | null;
  depositUsdCents: number;
}

export function bookingBreakdown(b: BookingMoney): BookingBreakdown {
  const lines = chargeLines(b);
  const sumUsdCents = lines.reduce((s, l) => s + l.amountUsdCents, 0);
  const totalUsdCents = n(b.total_usd_cents);
  const service = n(b.service_fee_usd_cents);
  const commission = n(b.commission_usd_cents);

  return {
    lines,
    sumUsdCents,
    totalUsdCents,
    balances: sumUsdCents === totalUsdCents,
    driftUsdCents: sumUsdCents - totalUsdCents,
    guidePayoutNprPaisa: n(b.guide_payout_npr_paisa),
    fxRateNpr: Number(b.fx_rate_npr ?? 0) || 0,
    // Equal means one cut written into two columns, not two cuts.
    commissionUsdCents: commission !== 0 && commission !== service ? commission : null,
    depositUsdCents: n(b.deposit_usd_cents),
  };
}

/** The guide's payout back in USD, for a line that sits beside dollar amounts. */
export function payoutUsdCents(b: BookingBreakdown): number | null {
  if (!b.guidePayoutNprPaisa || !b.fxRateNpr) return null;
  return Math.round(b.guidePayoutNprPaisa / b.fxRateNpr);
}
