/**
 * Fee math — the single source of truth (docs/02-architecture.md §Money).
 *
 * Money is ALWAYS integers: USD in cents, NPR in paisa. Never float money
 * (CLAUDE.md hard rule #3). Percentages are applied then rounded to the
 * nearest cent/paisa.
 *
 *   guide_fee      = day_rate × days × party        (multi-day)
 *                  = offering_price × party          (experiences)
 *   porter_fee     = porter_day_rate × days × porters (optional, multi-day)
 *   permit_fees    = Σ permits per person × party    (multi-day)
 *   service_fee    = 8% of (guide_fee + porter_fee)  (charged to trekker)
 *   permit_handling= $25 flat                        (multi-day only)
 *   commission     = 15% of (guide_fee + porter_fee) (deducted from payout)
 *
 *   trekker_pays   = guide_fee + porter_fee + permit_fees + service_fee + permit_handling
 *   guide_receives = (guide_fee + porter_fee) − commission   → NPR at booking fx
 */

export const SERVICE_FEE_RATE = 0.08;
export const COMMISSION_RATE = 0.15;
export const DEPOSIT_RATE = 0.3;
export const PERMIT_HANDLING_USD_CENTS = 2500; // $25 flat, multi-day only
export const FULL_PAYMENT_WINDOW_DAYS = 14; // inside this → 100% upfront

export interface PricingInput {
  /** Multi-day trek (true) vs single-day experience (false). */
  isMultiDay: boolean;
  partySize: number;
  fxRateNpr: number; // NPR per 1 USD, snapshotted at booking
  // Multi-day inputs:
  days?: number;
  dayRateUsdCents?: number;
  /** Σ of all permit costs for the route, per person (multi-day). */
  permitFeesPerPersonUsdCents?: number;
  porterDayRateUsdCents?: number;
  porters?: number;
  // Experience input:
  offeringPriceUsdCents?: number; // per person
}

export interface PriceBreakdown {
  guideFeeUsdCents: number;
  porterFeeUsdCents: number;
  permitFeesUsdCents: number;
  serviceFeeUsdCents: number;
  permitHandlingUsdCents: number;
  /** What the trekker pays. */
  totalUsdCents: number;
  /** Platform's 15% of (guide + porter). */
  commissionUsdCents: number;
  /** Guide's share in USD cents (guide + porter − commission). */
  guideReceivesUsdCents: number;
  /** Guide's payout fixed at booking, in NPR paisa. */
  guidePayoutNprPaisa: number;
}

function assertPositiveInt(name: string, v: number) {
  if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v)) {
    throw new Error(`pricing: ${name} must be a non-negative integer, got ${v}`);
  }
}

export function computePricing(input: PricingInput): PriceBreakdown {
  const { isMultiDay, partySize, fxRateNpr } = input;
  if (!Number.isInteger(partySize) || partySize < 1) {
    throw new Error(`pricing: partySize must be a positive integer, got ${partySize}`);
  }
  if (!Number.isFinite(fxRateNpr) || fxRateNpr <= 0) {
    throw new Error(`pricing: fxRateNpr must be positive, got ${fxRateNpr}`);
  }

  let guideFeeUsdCents: number;
  let porterFeeUsdCents = 0;
  let permitFeesUsdCents = 0;
  let permitHandlingUsdCents = 0;

  if (isMultiDay) {
    const days = input.days ?? 0;
    const dayRate = input.dayRateUsdCents ?? 0;
    assertPositiveInt("days", days);
    assertPositiveInt("dayRateUsdCents", dayRate);
    if (days < 1) throw new Error("pricing: multi-day booking needs days >= 1");
    guideFeeUsdCents = dayRate * days * partySize;

    const porterDayRate = input.porterDayRateUsdCents ?? 0;
    const porters = input.porters ?? 0;
    assertPositiveInt("porterDayRateUsdCents", porterDayRate);
    assertPositiveInt("porters", porters);
    porterFeeUsdCents = porterDayRate * days * porters;

    const permitPerPerson = input.permitFeesPerPersonUsdCents ?? 0;
    assertPositiveInt("permitFeesPerPersonUsdCents", permitPerPerson);
    permitFeesUsdCents = permitPerPerson * partySize;

    permitHandlingUsdCents = PERMIT_HANDLING_USD_CENTS;
  } else {
    const price = input.offeringPriceUsdCents ?? 0;
    assertPositiveInt("offeringPriceUsdCents", price);
    if (price < 1) throw new Error("pricing: experience needs offeringPriceUsdCents >= 1");
    guideFeeUsdCents = price * partySize;
  }

  const base = guideFeeUsdCents + porterFeeUsdCents;
  const serviceFeeUsdCents = Math.round(base * SERVICE_FEE_RATE);
  const commissionUsdCents = Math.round(base * COMMISSION_RATE);
  // guide receives base − commission so payout + commission always == base.
  const guideReceivesUsdCents = base - commissionUsdCents;

  const totalUsdCents =
    guideFeeUsdCents +
    porterFeeUsdCents +
    permitFeesUsdCents +
    serviceFeeUsdCents +
    permitHandlingUsdCents;

  // cents × (NPR per USD) == paisa exactly (both are 1/100 of their unit).
  const guidePayoutNprPaisa = Math.round(guideReceivesUsdCents * fxRateNpr);

  return {
    guideFeeUsdCents,
    porterFeeUsdCents,
    permitFeesUsdCents,
    serviceFeeUsdCents,
    permitHandlingUsdCents,
    totalUsdCents,
    commissionUsdCents,
    guideReceivesUsdCents,
    guidePayoutNprPaisa,
  };
}

/**
 * Deposit due now. Bookings starting inside the full-payment window are
 * charged 100% upfront; otherwise 30% deposit (docs/02 §Payment flow).
 */
export function computeDeposit(
  totalUsdCents: number,
  daysUntilStart: number,
): number {
  if (daysUntilStart < FULL_PAYMENT_WINDOW_DAYS) return totalUsdCents;
  return Math.round(totalUsdCents * DEPOSIT_RATE);
}

/** Balance charged at T-14 (docs/02). Zero when the deposit was the full amount. */
export function computeBalance(
  totalUsdCents: number,
  depositUsdCents: number,
): number {
  return Math.max(0, totalUsdCents - depositUsdCents);
}

/** Trekker-facing money: USD with a $ symbol (docs/04 §Interaction rules). */
export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: dollars % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Guide-facing money: NPR with the रू symbol (docs/04 §Interaction rules). */
export function formatNpr(paisa: number): string {
  const rupees = Math.round(paisa / 100);
  return `रू ${rupees.toLocaleString("en-IN")}`;
}
