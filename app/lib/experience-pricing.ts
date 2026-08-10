/**
 * Experience pricing (Feature Pack v3 §0). An experience is a packaged product
 * with its OWN price — NOT day_rate × days. Its price is a set of line items
 * that always sum to the displayed total (the total is derived, never stored
 * separately, so they can't disagree).
 *
 * Group pricing: the guide's fee is fixed per trip and amortises across the
 * group; permits/porters/logistics are per-person; the Trek fee and The Fund
 * are percentages of the per-person subtotal. Per-person price drops as the
 * group grows. All money is integer USD cents.
 */

export interface PriceBreakdown {
  /** Fixed per trip (the guide's cut = day_rate × days). Split across the group. */
  guide_fee_total_usd_cents: number;
  /** Per person. */
  permits_usd_cents: number;
  porters_usd_cents: number;
  logistics_usd_cents: number;
  /** Percentages (0.10 = 10%). */
  trek_pct: number;
  fund_pct: number;
}

export interface PricingLine {
  key: "guide" | "permits" | "porters" | "logistics" | "trek" | "fund";
  label: string;
  amountUsdCents: number;
}

export interface ExperiencePricing {
  groupSize: number;
  lines: PricingLine[];
  perPersonUsdCents: number;
  /** How much each person saves vs booking solo (guide fee amortised). */
  groupSavingsEachUsdCents: number;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Compute the per-person itemised price for a given group size. */
export function computeExperiencePricing(
  bd: PriceBreakdown,
  groupSize: number,
): ExperiencePricing {
  const g = Math.max(1, Math.floor(groupSize));
  const guidePP = Math.round(bd.guide_fee_total_usd_cents / g);
  const base = guidePP + bd.permits_usd_cents + bd.porters_usd_cents + bd.logistics_usd_cents;
  const trek = Math.round(base * bd.trek_pct);
  const fund = Math.round(base * bd.fund_pct);
  const lines: PricingLine[] = [
    { key: "guide", label: "Guide fees", amountUsdCents: guidePP },
    { key: "permits", label: "Permits (TIMS + park)", amountUsdCents: bd.permits_usd_cents },
    { key: "porters", label: "Porters", amountUsdCents: bd.porters_usd_cents },
    { key: "logistics", label: "Teahouse, food & logistics", amountUsdCents: bd.logistics_usd_cents },
    { key: "trek", label: `Trek fee (${pct(bd.trek_pct)})`, amountUsdCents: trek },
    { key: "fund", label: `The Fund (${pct(bd.fund_pct)})`, amountUsdCents: fund },
  ];
  const perPerson = lines.reduce((s, l) => s + l.amountUsdCents, 0);
  const soloGuide = bd.guide_fee_total_usd_cents; // guide fee at group of 1
  return {
    groupSize: g,
    lines,
    perPersonUsdCents: perPerson,
    groupSavingsEachUsdCents: soloGuide - guidePP,
  };
}

/** Sum of line amounts — the single source of truth for the total. */
export function breakdownTotal(lines: PricingLine[]): number {
  return lines.reduce((s, l) => s + l.amountUsdCents, 0);
}

/**
 * Validate that an explicit set of amounts sums to a claimed total. Returned
 * `ok:false` must render in `--alert` — never silently normalise a money figure.
 */
export function validateSum(lines: PricingLine[], claimedTotal: number): { ok: boolean; sum: number } {
  const sum = breakdownTotal(lines);
  return { ok: sum === claimedTotal, sum };
}

/** Cheapest per-person price (largest sensible group) for "from $X" on cards. */
export function fromPerPersonUsdCents(bd: PriceBreakdown, maxParty = 4): number {
  return computeExperiencePricing(bd, maxParty).perPersonUsdCents;
}
