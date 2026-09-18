/**
 * Reading a cancellation.
 *
 * Two facts about this data shape everything here, and both are traps.
 *
 * **`nonpayment` is not a status.** `cancelBooking` maps it onto
 * `cancelled_trekker`, so a trip auto-cancelled at T-10 for an unpaid balance
 * is indistinguishable from a trekker who changed their mind — except in
 * `cancellation_reason`, which is the only place the distinction survives. A
 * screen that groups by status will tell the office that trekkers cancelled
 * four trips they never touched. So everything here reads the reason.
 *
 * **The refund is not on the booking.** It lives in `payments` rows of type
 * `refund` with a NEGATIVE `amount_usd_cents`, one per PaymentIntent that was
 * refunded — so a trip paid in a deposit and two instalments has three refund
 * rows, and "how much went back" is a sum with a sign flip.
 */

export type Who = "trekker" | "guide" | "platform" | "unknown";

/**
 * How much went back, per booking.
 *
 * Refunds are stored negative (the ledger reads in one direction), so this
 * flips them: the office wants to read "$430 refunded", not "-$430".
 */
export function refundTotals(
  payments: Array<{ booking_id: string; amount_usd_cents: number }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of payments ?? []) {
    const cents = Math.abs(Number(p.amount_usd_cents) || 0);
    out[p.booking_id] = (out[p.booking_id] ?? 0) + cents;
  }
  return out;
}

/** Who actually made this happen. */
export function whoCancelled(reason: string | null | undefined): Who {
  const r = String(reason ?? "").trim();
  if (r === "trekker") return "trekker";
  if (r === "guide") return "guide";
  // Nobody pressed anything: the sweep picked the moment, and force majeure
  // is the weather.
  if (r === "nonpayment" || r === "force_majeure" || r === "hold_expired") return "platform";
  return "unknown";
}

/**
 * The words in the "why" column.
 *
 * This is where the status/reason collapse gets undone for the reader. The
 * status says `cancelled_trekker` for four different events; only the reason
 * tells them apart, and a reason nobody recorded is said out loud rather than
 * guessed at.
 */
export function reasonLabel(status: string, reason: string | null | undefined): string {
  const r = String(reason ?? "").trim();
  switch (r) {
    case "trekker":
      return "Trekker cancelled";
    case "guide":
      return "Guide pulled out";
    case "force_majeure":
      return "Force majeure";
    case "nonpayment":
      return "Not paid in time — automatic";
    case "hold_expired":
      return "Hold ran out before the deposit";
    default:
      break;
  }
  // No reason on the row. Say which side the status blames and that nobody
  // wrote it down, rather than presenting the status as if it were a reason.
  const side = String(status ?? "").replace("cancelled_", "").replace(/_/g, " ");
  return side ? `${side} — reason not recorded` : "Reason not recorded";
}

export const REASON_TONE: Record<Who, "red" | "amber" | "neutral"> = {
  trekker: "amber",
  guide: "red",
  platform: "neutral",
  unknown: "neutral",
};

/** Grouped by reason, commonest first — what the office is actually losing trips to. */
export function byReason<T extends { cancellation_reason?: string | null }>(
  rows: T[],
): Array<{ reason: string; rows: T[] }> {
  const map = new Map<string, T[]>();
  for (const r of rows ?? []) {
    const key = String(r.cancellation_reason ?? "").trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return [...map]
    .map(([reason, rs]) => ({ reason, rows: rs }))
    .sort((a, b) => b.rows.length - a.rows.length);
}
