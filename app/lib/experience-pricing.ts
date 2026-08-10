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

export interface PartyAmounts {
  guideUsdCents: number;
  permitsUsdCents: number;
  portersUsdCents: number;
  logisticsUsdCents: number;
  trekUsdCents: number;
  fundUsdCents: number;
  totalUsdCents: number;
}

/**
 * Whole-party amounts = per-person line × party, so the charged total is
 * exactly (per-person price × party) and the sub-amounts sum to it. Used to
 * reconcile the server quote/booking snapshot with what the page displayed.
 */
export function partyAmounts(bd: PriceBreakdown, groupSize: number): PartyAmounts {
  const g = Math.max(1, Math.floor(groupSize));
  const pp = computeExperiencePricing(bd, g);
  const x = (i: number) => pp.lines[i].amountUsdCents * g;
  return {
    guideUsdCents: x(0),
    permitsUsdCents: x(1),
    portersUsdCents: x(2),
    logisticsUsdCents: x(3),
    trekUsdCents: x(4),
    fundUsdCents: x(5),
    totalUsdCents: pp.perPersonUsdCents * g,
  };
}

// ── Budget recomposer (v3 §1c) ──────────────────────────────────────────────
// A budget slider recomposes the package to hit a target — teahouse tier and
// porter are the honest levers on a fixed-length packaged trek (days/itinerary
// recomposition belongs on route/custom-trip pages). Fee follows the package.

export type TeahouseTier = "comfort" | "standard" | "basic";
export const TEAHOUSE_MULT: Record<TeahouseTier, number> = {
  comfort: 1,
  standard: 0.8,
  basic: 0.6,
};
export const TEAHOUSE_LABEL: Record<TeahouseTier, string> = {
  comfort: "Comfort teahouses",
  standard: "Standard teahouses",
  basic: "Basic teahouses",
};

/** Apply the budget levers to the breakdown (teahouse tier + porter on/off). */
export function recompose(
  bd: PriceBreakdown,
  opts: { tier: TeahouseTier; porter: boolean },
): PriceBreakdown {
  return {
    ...bd,
    logistics_usd_cents: Math.round(bd.logistics_usd_cents * TEAHOUSE_MULT[opts.tier]),
    porters_usd_cents: opts.porter ? bd.porters_usd_cents : 0,
  };
}

export interface BudgetConfig {
  tier: TeahouseTier;
  porter: boolean;
  perPersonUsdCents: number;
}

/** Every lever combination, priced for the group, sorted cheapest → fullest. */
export function budgetConfigs(bd: PriceBreakdown, groupSize: number): BudgetConfig[] {
  const out: BudgetConfig[] = [];
  for (const tier of ["comfort", "standard", "basic"] as TeahouseTier[]) {
    for (const porter of [true, false]) {
      const perPersonUsdCents = computeExperiencePricing(
        recompose(bd, { tier, porter }),
        groupSize,
      ).perPersonUsdCents;
      out.push({ tier, porter, perPersonUsdCents });
    }
  }
  return out.sort((a, b) => a.perPersonUsdCents - b.perPersonUsdCents);
}

/** Richest config within the target budget (or the cheapest if none fit). */
export function pickConfig(configs: BudgetConfig[], targetUsdCents: number): BudgetConfig {
  const within = configs.filter((c) => c.perPersonUsdCents <= targetUsdCents);
  return within.length ? within[within.length - 1] : configs[0];
}
