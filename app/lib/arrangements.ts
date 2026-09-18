/**
 * Gear, hotels, transport — the parts of a trip that are not the guide.
 *
 * Pure: the labels, the money arithmetic and the "what is still outstanding"
 * question, with no database in sight, so the booking page and anything that
 * later lists these across trips agree about what a row means.
 */

export type ArrangementKind = "gear" | "hotel" | "transport" | "permit_agent" | "other";
export type ArrangementStatus = "to_book" | "booked" | "paid" | "cancelled";

export const ARRANGEMENT_KINDS: Array<{ key: ArrangementKind; label: string; hint: string }> = [
  { key: "transport", label: "Transport", hint: "Bus, jeep, flight — getting there and back" },
  { key: "hotel", label: "Hotel", hint: "Nights in town, either end of the trek" },
  { key: "gear", label: "Gear hire", hint: "Down jacket, sleeping bag, poles" },
  { key: "permit_agent", label: "Agency work", hint: "What the partner agency does for us" },
  { key: "other", label: "Something else", hint: "Anything this list does not cover" },
];

export const ARRANGEMENT_STATUSES: Array<{ key: ArrangementStatus; label: string }> = [
  { key: "to_book", label: "To book" },
  { key: "booked", label: "Booked, not paid" },
  { key: "paid", label: "Paid" },
  { key: "cancelled", label: "Cancelled" },
];

export const kindLabel = (k: string): string =>
  ARRANGEMENT_KINDS.find((x) => x.key === k)?.label ?? "Something else";

export const statusLabel = (s: string): string =>
  ARRANGEMENT_STATUSES.find((x) => x.key === s)?.label ?? s;

export interface Arrangement {
  id?: string;
  kind?: string | null;
  title?: string | null;
  vendor?: string | null;
  reference?: string | null;
  happens_on?: string | null;
  status?: string | null;
  currency?: string | null;
  cost_minor?: number | null;
  paid_minor?: number | null;
  due_on?: string | null;
  note?: string | null;
}

const n = (v: number | null | undefined) => (typeof v === "number" && isFinite(v) ? v : 0);

export interface ArrangementTotals {
  /** Per currency, because a Lukla seat can be sold in dollars. */
  byCurrency: Array<{ currency: string; costMinor: number; paidMinor: number; owedMinor: number }>;
  toBook: number;
  toPay: number;
  cancelled: number;
}

/**
 * What these add up to, kept per currency rather than summed into one number.
 *
 * Adding rupees to dollars is the kind of thing that looks fine on a screen
 * and is wrong by a factor of a hundred and thirty. If a trip has both, the
 * office sees both.
 */
export function arrangementTotals(rows: Arrangement[]): ArrangementTotals {
  const live = rows.filter((r) => r.status !== "cancelled");
  const acc = new Map<string, { costMinor: number; paidMinor: number }>();
  for (const r of live) {
    const cur = (r.currency ?? "NPR").toUpperCase();
    const at = acc.get(cur) ?? { costMinor: 0, paidMinor: 0 };
    at.costMinor += n(r.cost_minor);
    at.paidMinor += n(r.paid_minor);
    acc.set(cur, at);
  }
  return {
    byCurrency: [...acc.entries()]
      .map(([currency, v]) => ({
        currency,
        ...v,
        owedMinor: Math.max(0, v.costMinor - v.paidMinor),
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    toBook: live.filter((r) => r.status === "to_book").length,
    toPay: live.filter((r) => r.status === "booked").length,
    cancelled: rows.length - live.length,
  };
}

/** Minor units in a readable line: "NPR 12,500" / "USD 180.00". */
export function formatMinor(minor: number, currency: string): string {
  const major = minor / 100;
  return `${currency.toUpperCase()} ${major.toLocaleString("en-US", {
    minimumFractionDigits: major % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * The order the office reads them in: what is late, then what is next, then
 * what is settled, then what was called off.
 */
export function sortArrangements(rows: Arrangement[], todayIso: string): Arrangement[] {
  const rank = (r: Arrangement) => {
    if (r.status === "cancelled") return 3;
    if (r.status === "paid") return 2;
    if (r.due_on && r.due_on < todayIso) return 0;
    return 1;
  };
  return [...rows].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return (a.happens_on ?? a.due_on ?? "9999").localeCompare(b.happens_on ?? b.due_on ?? "9999");
  });
}
