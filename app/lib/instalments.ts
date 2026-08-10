/**
 * Interest-free instalments (Feature Pack v3 §1d/§2). The balance (total minus
 * deposit) splits into N equal payments, all due BEFORE departure. No interest,
 * ever. Pure + unit-tested. Integer USD cents — the last instalment absorbs the
 * rounding remainder so the parts always sum to the balance exactly.
 */
export interface Instalment {
  seq: number;
  amountUsdCents: number;
  dueDate: string; // YYYY-MM-DD
}

/** ISO date (YYYY-MM-DD) `days` after `from`. */
function addDays(fromIso: string, days: number): string {
  const d = new Date(fromIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000,
  );
}

/** Largest number of monthly-ish instalments that fit before departure. */
export function maxInstalments(fromIso: string, departureIso: string): number {
  const days = daysBetween(fromIso, departureIso);
  // leave a 7-day buffer before departure for the final payment to clear
  return Math.max(1, Math.min(12, Math.floor((days - 7) / 30) + 1));
}

/**
 * Build the schedule. `count` payments spread evenly between `fromIso` and a
 * final due date 7 days before departure; equal amounts, last one carries the
 * remainder. Falls back to a single payment when there isn't room.
 */
export function instalmentSchedule(
  balanceUsdCents: number,
  count: number,
  fromIso: string,
  departureIso: string,
): Instalment[] {
  const n = Math.max(1, Math.min(count, maxInstalments(fromIso, departureIso)));
  const finalDue = addDays(departureIso, -7);
  const span = Math.max(0, daysBetween(fromIso, finalDue));
  const base = Math.floor(balanceUsdCents / n);
  const out: Instalment[] = [];
  for (let i = 0; i < n; i++) {
    const amount = i === n - 1 ? balanceUsdCents - base * (n - 1) : base;
    const dueDate = n === 1 ? finalDue : addDays(fromIso, Math.round((span * i) / (n - 1)));
    out.push({ seq: i + 1, amountUsdCents: amount, dueDate });
  }
  return out;
}
