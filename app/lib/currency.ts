/**
 * Multi-currency DISPLAY (Feature Pack v3 §1e). Conversion is display-only at a
 * cached daily rate; we settle in ONE currency (USD) and say so. Source of truth
 * is always USD cents, so the Split still sums — we convert each line and derive
 * the shown total from the converted lines, never the other way round.
 */
export interface CurrencyMeta {
  symbol: string;
  /** Units of this currency per 1 USD (cached daily snapshot). */
  rate: number;
  dp: number;
}

export const SETTLEMENT: CurrencyCode = "USD";

export const CURRENCIES = {
  USD: { symbol: "$", rate: 1, dp: 2 },
  EUR: { symbol: "€", rate: 0.92, dp: 2 },
  GBP: { symbol: "£", rate: 0.79, dp: 2 },
  AUD: { symbol: "A$", rate: 1.52, dp: 2 },
  NPR: { symbol: "₨", rate: 133, dp: 0 }, // guides/ledger only
} as const satisfies Record<string, CurrencyMeta>;

export type CurrencyCode = keyof typeof CURRENCIES;

/** Currencies offered to trekkers in the UI toggle (NPR is internal). */
export const DISPLAY_CURRENCIES: CurrencyCode[] = ["USD", "EUR", "GBP", "AUD"];

/** Convert USD cents → integer minor units of the target currency. */
export function toMinor(usdCents: number, code: CurrencyCode): number {
  return Math.round(usdCents * CURRENCIES[code].rate);
}

/** Format integer minor units in the target currency. */
export function fmtMinor(minor: number, code: CurrencyCode): string {
  const c = CURRENCIES[code];
  return (
    c.symbol +
    (minor / 100).toLocaleString("en-US", {
      minimumFractionDigits: c.dp,
      maximumFractionDigits: c.dp,
    })
  );
}

/** Convert + format a USD-cent amount for display. */
export function money(usdCents: number, code: CurrencyCode): string {
  return fmtMinor(toMinor(usdCents, code), code);
}
