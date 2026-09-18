/**
 * Experience pricing (Feature Pack v3 §0). An experience is a packaged product
 * with its OWN price — NOT day_rate × days. Its price is a set of line items
 * that always sum to the displayed total (the total is derived, never stored
 * separately, so they can't disagree).
 *
 * Group pricing: the guide's fee is fixed per trip and amortises across the
 * group; permits/porters/logistics are per-person; our fee and The Fund
 * are percentages of the per-person subtotal. Per-person price drops as the
 * group grows. All money is integer USD cents.
 */

/**
 * Which booking-snapshot column a line belongs to.
 *
 * A guide's own labels are what the traveller reads, but a booking stores four
 * fixed money columns and the Fund is computed off them. Every line therefore
 * declares which bucket it lands in, so custom wording never changes what a
 * booking records or what the Fund is owed.
 */
export type PriceBucket = "guide" | "permits" | "porters" | "logistics";

export interface PriceLine {
  /** Stable across edits, so React keys and diffing behave. */
  id: string;
  label: string;
  /** The price of ONE of whatever this line is: one porter, one jeep, one permit. */
  amountUsdCents: number;
  /** "group" divides across the party (a guide's fee); "person" does not. */
  basis: "person" | "group";
  /** "day" multiplies by the trip's length; "trip" is a one-off. */
  cadence: "day" | "trip";
  /** An add-on the traveller chooses — priced, but outside the headline. */
  optional: boolean;
  bucket: PriceBucket;
  /**
   * How this cost grows with the party.
   *
   * "person" and "group" are the two the form has always had, and between them
   * they cannot express the two costs that matter most on a real trek.
   *
   * A porter carries about 20 kg, which is two trekkers' duffels — so a party
   * of three needs two porters, not three and not one. Priced "person", every
   * trekker was charged for a whole porter; priced "group", one porter was
   * expected to carry for twelve.
   *
   * A jeep seats six. A party of eight needs two of them, and the cost steps
   * rather than sliding. Priced "group" it did not move at all: two people and
   * twelve people were quoted the same transport.
   *
   * "unit" is that missing shape — one unit per `per` trekkers, rounded up.
   * Absent means the old behaviour, so every breakdown written before this
   * still prices exactly as it did.
   */
  scale?: "person" | "group" | "unit";
  /** For "unit": how many trekkers one unit covers. A porter: 2. A jeep: 6. */
  per?: number;
  /** For "unit": what one of them is called, so the page can say "2 porters". */
  unitLabel?: string;
}

/** What a line actually is, with the old two-way basis folded in. */
export function lineScale(l: PriceLine): "person" | "group" | "unit" {
  if (l.scale) return l.scale;
  return l.basis === "group" ? "group" : "person";
}

/**
 * How many porters, jeeps or whatever else this party needs.
 *
 * Rounded up, because half a jeep is a jeep. One, at least, for a line that
 * exists at all.
 */
export function unitsFor(l: PriceLine, groupSize: number): number {
  if (lineScale(l) !== "unit") return 1;
  const per = Math.max(1, Math.floor(l.per ?? 1));
  return Math.max(1, Math.ceil(Math.max(1, groupSize) / per));
}

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
  /**
   * The line-item form. A fourteen-day Manaslu trek and a three-hour momo walk
   * cannot share four fixed slots, so a breakdown may instead carry as many
   * lines as the trip actually has. When present these win; the four slots
   * above stay for every offering priced before this existed.
   */
  lines?: PriceLine[];
  /** Trip length, needed to resolve cadence:"day" lines. */
  days?: number;
  /** Dates that cost more or less than the rest of the year. */
  seasons?: PriceSeason[];
}

/**
 * A stretch of the year priced differently.
 *
 * Stored as month-day, not full dates, because a season recurs: October is
 * peak every October, and a guide should not have to re-enter their pricing
 * each January. A range whose end falls before its start wraps the year end,
 * which is how a December-to-February season is written.
 */
export interface PriceSeason {
  id: string;
  label: string;
  /** "MM-DD" */
  from: string;
  to: string;
  /** 0.2 = a fifth more; -0.25 = a quarter less. */
  pct: number;
}

const md = (iso: string) => iso.slice(5, 10);

/** The season a date falls in, or null. First match wins. */
export function seasonFor(
  bd: PriceBreakdown | null | undefined,
  dateIso: string | null | undefined,
): PriceSeason | null {
  if (!bd?.seasons?.length || !dateIso) return null;
  const d = md(dateIso);
  if (!/^\d{2}-\d{2}$/.test(d)) return null;
  return (
    bd.seasons.find((s) =>
      s.from <= s.to
        ? d >= s.from && d <= s.to
        : // Wraps the year end: Dec 15 → Feb 10 is "late in the year or early".
          d >= s.from || d <= s.to,
    ) ?? null
  );
}

/**
 * Does this offering carry a real itemised price?
 *
 * Seven call sites used to test `guide_fee_total_usd_cents` for truthiness as a
 * stand-in for this question — including the booking path. A line-item trip can
 * leave that slot at zero, so the test has to be asked properly.
 */
export function hasBreakdown(bd: PriceBreakdown | null | undefined): bd is PriceBreakdown {
  if (!bd) return false;
  if (bd.lines?.length) return bd.lines.some((l) => l.amountUsdCents > 0);
  return !!bd.guide_fee_total_usd_cents;
}

/** Per-person contribution of one line at a given group size. */
function linePerPerson(l: PriceLine, groupSize: number, days: number): number {
  const spans = l.cadence === "day" ? Math.max(1, days) : 1;
  const g = Math.max(1, groupSize);
  const scale = lineScale(l);
  if (scale === "person") return l.amountUsdCents * spans;
  // Both of the others are a cost the party shares: one guide, or three
  // porters. What differs is how many of the thing the party needs.
  const total = l.amountUsdCents * spans * unitsFor(l, g);
  return Math.round(total / g);
}

export interface PricingLine {
  /** Fixed keys for the four legacy buckets and the two percentages; a
      line-item breakdown emits `line:<id>` for each of the guide's own. */
  key: string;
  label: string;
  amountUsdCents: number;
  /** Which snapshot column this belongs to. Absent on trek/fund. */
  bucket?: PriceBucket;
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
  /** The date the trip starts, so a season can be applied. */
  startDate?: string | null,
): ExperiencePricing {
  const g = Math.max(1, Math.floor(groupSize));

  // Line-item breakdowns keep the guide's own labels; the four-slot form is
  // what every offering priced before the builder existed still carries.
  const itemised = bd.lines?.length
    ? bd.lines.filter((l) => !l.optional)
    : null;

  let lines: PricingLine[];
  let soloGuide: number;

  if (itemised) {
    const days = bd.days ?? 1;
    const own: PricingLine[] = itemised.map((l) => ({
      key: `line:${l.id}`,
      label: l.label,
      amountUsdCents: linePerPerson(l, g, days),
      bucket: l.bucket,
    }));
    const subtotal = own.reduce((s, l) => s + l.amountUsdCents, 0);
    // A season is its own line, never folded into the numbers above it: a
    // reader who is paying a fifth more in October is entitled to see that
    // said, and to see the same base figures a June trekker sees.
    const season = seasonFor(bd, startDate);
    const uplift = season ? Math.round(subtotal * season.pct) : 0;
    const base = subtotal + uplift;
    lines = [
      ...own,
      ...(season && uplift !== 0
        ? [
            {
              key: `season:${season.id}`,
              label: `${season.label} (${season.pct > 0 ? "+" : ""}${Math.round(season.pct * 100)}%)`,
              amountUsdCents: uplift,
              // The uplift belongs to whoever the trip belongs to.
              bucket: "guide" as PriceBucket,
            },
          ]
        : []),
      { key: "trek", label: `Our fee (${pct(bd.trek_pct)})`, amountUsdCents: Math.round(base * bd.trek_pct) },
      { key: "fund", label: `The Fund (${pct(bd.fund_pct)})`, amountUsdCents: Math.round(base * bd.fund_pct) },
    ];
    // What one person would carry alone, for the group-saving figure.
    soloGuide = itemised
      .filter((l) => l.basis === "group")
      .reduce((s, l) => s + linePerPerson(l, 1, days), 0);
  } else {
    const guidePP = Math.round(bd.guide_fee_total_usd_cents / g);
    const base = guidePP + bd.permits_usd_cents + bd.porters_usd_cents + bd.logistics_usd_cents;
    lines = [
      { key: "guide", label: "Guide fees", amountUsdCents: guidePP, bucket: "guide" },
      { key: "permits", label: "Permits (TIMS + park)", amountUsdCents: bd.permits_usd_cents, bucket: "permits" },
      { key: "porters", label: "Porters", amountUsdCents: bd.porters_usd_cents, bucket: "porters" },
      { key: "logistics", label: "Teahouse, food & logistics", amountUsdCents: bd.logistics_usd_cents, bucket: "logistics" },
      { key: "trek", label: `Our fee (${pct(bd.trek_pct)})`, amountUsdCents: Math.round(base * bd.trek_pct) },
      { key: "fund", label: `The Fund (${pct(bd.fund_pct)})`, amountUsdCents: Math.round(base * bd.fund_pct) },
    ];
    soloGuide = bd.guide_fee_total_usd_cents;
  }

  const perPerson = lines.reduce((s, l) => s + l.amountUsdCents, 0);
  const amortisedPP = itemised
    ? itemised
        .filter((l) => l.basis === "group")
        .reduce((s, l) => s + linePerPerson(l, g, bd.days ?? 1), 0)
    : Math.round(bd.guide_fee_total_usd_cents / g);
  return {
    groupSize: g,
    lines,
    perPersonUsdCents: perPerson,
    groupSavingsEachUsdCents: soloGuide - amortisedPP,
  };
}

/**
 * The optional lines, priced per person for a group — the add-ons a traveller
 * toggles at checkout. Kept out of the headline so a price is never quoted
 * including something the traveller has not chosen.
 */
/**
 * The six amounts the split bar draws, taken by meaning rather than position.
 *
 * `computeExperiencePricing` returns lines in two different shapes. A trip
 * priced from rollup totals returns exactly six, in a known order. A trip
 * priced from its own itemised lines returns one per line the guide wrote,
 * plus an optional season row, plus our fee and the Fund — a length nobody can
 * predict.
 *
 * The trip page read them as `lines[0]` … `lines[5]`. On a trip whose guide
 * had written three lines that is `lines[3].amountUsdCents` on undefined — a
 * 500, which is what "Langtang Valley Experience" did the moment it was
 * created. On an itemised trip with six or more lines it did not crash; it
 * quietly drew the third line's money under "Porters" and the fourth under
 * "Teahouse & logistics", whatever they actually were.
 *
 * Buckets are the thing that survives both shapes, so buckets are what this
 * adds up. Our fee and the Fund carry no bucket and are found by key.
 */
export function splitAmounts(pricing: { lines: PricingLine[] }): {
  guide: number;
  permits: number;
  porters: number;
  logistics: number;
  trek: number;
  fund: number;
} {
  const byBucket = (b: PriceBucket) =>
    pricing.lines.reduce((sum, l) => (l.bucket === b ? sum + l.amountUsdCents : sum), 0);
  const byKey = (k: string) =>
    pricing.lines.reduce((sum, l) => (l.key === k ? sum + l.amountUsdCents : sum), 0);
  return {
    guide: byBucket("guide"),
    permits: byBucket("permits"),
    porters: byBucket("porters"),
    logistics: byBucket("logistics"),
    trek: byKey("trek"),
    fund: byKey("fund"),
  };
}

export function addOns(
  bd: PriceBreakdown,
  groupSize: number,
): Array<{ id: string; label: string; perPersonUsdCents: number }> {
  const g = Math.max(1, Math.floor(groupSize));
  return (bd.lines ?? [])
    .filter((l) => l.optional)
    .map((l) => ({
      id: l.id,
      label: l.label,
      perPersonUsdCents: linePerPerson(l, g, bd.days ?? 1),
    }));
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
export function fromPerPersonUsdCents(bd: PriceBreakdown, maxParty?: number | null): number {
  // "From" = cheapest per-person at the largest group that can ACTUALLY book
  // this offering (audit 6.7: a 2-person-max trip must not advertise a
  // 4-person price). Capped at 4 so tiny per-person figures for huge groups
  // don't set an unrealistic anchor.
  const group = Math.max(1, Math.min(maxParty ?? 4, 4));
  const base = computeExperiencePricing(bd, group).perPersonUsdCents;
  // "From" has to mean it: if a season is cheaper than the rest of the year,
  // that is the number, not the one somebody pays in October.
  const cheapest = (bd.seasons ?? [])
    .filter((s) => s.pct < 0)
    .reduce((lo, s) => {
      const p = computeExperiencePricing(bd, group, `2000-${s.from}`).perPersonUsdCents;
      return Math.min(lo, p);
    }, base);
  return cheapest;
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
export function partyAmounts(
  bd: PriceBreakdown,
  groupSize: number,
  startDate?: string | null,
): PartyAmounts {
  const g = Math.max(1, Math.floor(groupSize));
  const pp = computeExperiencePricing(bd, g, startDate);
  // Summed by bucket, not by position: a line-item breakdown has as many lines
  // as the trip needs, and reading index 3 for "logistics" would silently
  // record the wrong number against a booking.
  const bucket = (b: PriceBucket) =>
    pp.lines.filter((l) => l.bucket === b).reduce((s, l) => s + l.amountUsdCents, 0) * g;
  const keyed = (k: string) =>
    pp.lines.filter((l) => l.key === k).reduce((s, l) => s + l.amountUsdCents, 0) * g;
  return {
    guideUsdCents: bucket("guide"),
    permitsUsdCents: bucket("permits"),
    portersUsdCents: bucket("porters"),
    logisticsUsdCents: bucket("logistics"),
    trekUsdCents: keyed("trek"),
    fundUsdCents: keyed("fund"),
    totalUsdCents: pp.perPersonUsdCents * g,
  };
}

/**
 * The cost components a guide picks from, by trip type. Scaffolding for the
 * builder, not a closed list — a guide can always add their own line, and what
 * they add here is what tells us which components to offer next.
 */
export const COMPONENT_LIBRARY: Record<
  string,
  Array<Omit<PriceLine, "id" | "amountUsdCents">>
> = {
  trek: [
    { label: "Guide fee", basis: "group", cadence: "day", optional: false, bucket: "guide" },
    // A porter carries about 20 kg — two trekkers' duffels. Priced per person
    // every trekker was charged for a whole porter, which is roughly double.
    { label: "Porter", basis: "group", scale: "unit", per: 2, unitLabel: "porter", cadence: "day", optional: true, bucket: "porters" },
    { label: "Permits", basis: "person", cadence: "trip", optional: false, bucket: "permits" },
    { label: "Teahouse & food", basis: "person", cadence: "day", optional: false, bucket: "logistics" },
    // A jeep seats six. Priced per group this did not move at all: two people
    // and twelve people were quoted the same transport.
    { label: "Transport in and out", basis: "group", scale: "unit", per: 6, unitLabel: "vehicle", cadence: "trip", optional: false, bucket: "logistics" },
    { label: "Domestic flights", basis: "person", cadence: "trip", optional: false, bucket: "logistics" },
    { label: "Gear hire", basis: "person", cadence: "trip", optional: true, bucket: "logistics" },
    { label: "Extra acclimatisation day", basis: "person", cadence: "trip", optional: true, bucket: "logistics" },
  ],
  day_hike: [
    { label: "Guide fee", basis: "group", cadence: "trip", optional: false, bucket: "guide" },
    { label: "Entry tickets", basis: "person", cadence: "trip", optional: false, bucket: "permits" },
    { label: "Transport", basis: "group", scale: "unit", per: 6, unitLabel: "vehicle", cadence: "trip", optional: false, bucket: "logistics" },
    { label: "Food", basis: "person", cadence: "trip", optional: false, bucket: "logistics" },
    { label: "Equipment", basis: "person", cadence: "trip", optional: true, bucket: "logistics" },
  ],
  adventure: [
    { label: "Activity fee", basis: "person", cadence: "trip", optional: false, bucket: "logistics" },
    { label: "Instructor", basis: "group", cadence: "trip", optional: false, bucket: "guide" },
    { label: "Safety equipment", basis: "person", cadence: "trip", optional: false, bucket: "logistics" },
    { label: "Transport", basis: "group", scale: "unit", per: 6, unitLabel: "vehicle", cadence: "trip", optional: false, bucket: "logistics" },
  ],
};
COMPONENT_LIBRARY.city = COMPONENT_LIBRARY.day_hike;
COMPONENT_LIBRARY.food_culture = COMPONENT_LIBRARY.day_hike;

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

/**
 * What the porters on this trip cost, per person, however the price is shaped.
 *
 * Zero means this trip has no porter to decide about — a day hike, a food
 * tour, a trek the guide prices without one — and the tick box for it is not
 * shown at all rather than shown at $0.
 */
export function porterCostOf(bd: PriceBreakdown | null | undefined): number {
  if (!bd) return 0;
  if (bd.lines?.length) {
    return bd.lines
      .filter((l) => l.bucket === "porters" && !l.optional)
      .reduce((sum, l) => sum + linePerPerson(l, 1, bd.days ?? 1), 0);
  }
  return bd.porters_usd_cents ?? 0;
}

/** Apply the budget levers to the breakdown (teahouse tier + porter on/off). */
export function recompose(
  bd: PriceBreakdown,
  opts: { tier: TeahouseTier; porter: boolean },
): PriceBreakdown {
  // The levers act on the same two buckets whichever shape the price is in.
  if (bd.lines?.length) {
    return {
      ...bd,
      lines: bd.lines.map((l) =>
        l.bucket === "logistics"
          ? { ...l, amountUsdCents: Math.round(l.amountUsdCents * TEAHOUSE_MULT[opts.tier]) }
          : l.bucket === "porters" && !opts.porter
            ? { ...l, amountUsdCents: 0 }
            : l,
      ),
    };
  }
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
