/**
 * Display formatting shared across screens (audit §8: the same date appeared
 * raw-ISO on one page and formatted on the next). UTC everywhere so SSR and
 * the client always agree.
 */

/** "4 Oct 2026" — the default for any date a person reads. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00Z" : iso);
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "4 Oct" — when the year is obvious from context (schedules, ranges). */
export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00Z" : iso);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "4–17 Oct 2026" / "28 Sep – 4 Oct 2026" for a trek's span. */
export function fmtDateRange(startIso: string, endIso: string): string {
  if (!startIso || !endIso) return "";
  const s = new Date(startIso + "T00:00:00Z");
  const e = new Date(endIso + "T00:00:00Z");
  const sameMonth = s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  return sameMonth
    ? `${s.getUTCDate()}–${fmtDate(endIso)}`
    : `${fmtDateShort(startIso)} – ${fmtDate(endIso)}`;
}

/** Human labels for booking statuses — never show the raw enum. */
const STATUS_LABELS: Record<string, string> = {
  pending_deposit: "Deposit due",
  deposit_paid: "Deposit paid",
  docs_pending: "Documents needed",
  confirmed: "Confirmed",
  active: "On the trail",
  completed: "Completed",
  cancelled_trekker: "Cancelled",
  cancelled_guide: "Cancelled by guide",
  cancelled_force_majeure: "Cancelled — force majeure",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

/** Altitudes and other big numbers always carry a thousands separator. */
export function fmtMetres(m: number | null | undefined): string {
  return m == null ? "" : `${m.toLocaleString("en-US")}m`;
}
