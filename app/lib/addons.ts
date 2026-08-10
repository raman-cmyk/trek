/**
 * Optional trek add-ons (Feature Pack v3 §1b). Each is its own labelled line —
 * nothing hidden. Pass-through partner services: the platform takes no margin on
 * them, so they're added after the trek/fund lines, not inside the fee base.
 * Prices are per person, integer USD cents. (Ops-configurable per offering is a
 * later step; this is the standard catalogue.)
 */
export interface Addon {
  key: string;
  label: string;
  note: string;
  amountUsdCents: number;
}

export const STANDARD_ADDONS: Addon[] = [
  {
    key: "gear",
    label: "Gear rental",
    note: "Down jacket, sleeping bag & poles — pickup in Thamel, Kathmandu the day before you fly out.",
    amountUsdCents: 6000,
  },
  {
    key: "airport_hotel",
    label: "Airport pickup + first-night hotel",
    note: "Met at Kathmandu airport and one night at a partner hotel before the trek.",
    amountUsdCents: 4500,
  },
];

/** Sum the selected add-ons (per person). */
export function addonsTotalUsdCents(selected: Set<string>): number {
  return STANDARD_ADDONS.filter((a) => selected.has(a.key)).reduce(
    (s, a) => s + a.amountUsdCents,
    0,
  );
}
