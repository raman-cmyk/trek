/**
 * The permit tracker's filters.
 *
 * Every permit application for every upcoming trek in one list, sorted by how
 * soon the trek leaves. That is the right order to work in and the wrong one
 * to answer a question in: "what is still waiting on documents" meant reading
 * every row. The filters are the questions actually asked of this page.
 */

export const PERMIT_STATUSES = [
  "awaiting_docs",
  "filed",
  "approved",
  "ready",
  "rejected",
] as const;
export type PermitStatus = (typeof PERMIT_STATUSES)[number];

export const PERMIT_TONE: Record<PermitStatus, "neutral" | "amber" | "blue" | "green" | "red"> = {
  awaiting_docs: "neutral",
  filed: "amber",
  approved: "blue",
  ready: "green",
  rejected: "red",
};

/**
 * Soonest trek first — the one that will hurt first if its permit is late.
 * A row with no date sorts last rather than first, where an empty string would
 * otherwise put it.
 */
export function bySoonest<T extends { booking?: { start_date?: string | null } | null }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const x = a.booking?.start_date ?? "";
    const y = b.booking?.start_date ?? "";
    if (!x) return 1;
    if (!y) return -1;
    return x.localeCompare(y);
  });
}

/** What ops is allowed to write when logging one by hand. */
export function manualEntryProblem(input: {
  bookingId: string;
  permitId: string;
  status: string;
}): string | null {
  if (!input.bookingId) return "Pick the booking this permit is for.";
  if (!input.permitId) return "Pick which permit it is.";
  if (!PERMIT_STATUSES.includes(input.status as PermitStatus)) {
    return "That is not a permit status.";
  }
  return null;
}

/** The timestamps a status implies, so a hand-logged row reads like a filed one. */
export function stampsFor(status: string, now = new Date()): Record<string, string> {
  const iso = now.toISOString();
  const stamps: Record<string, string> = {};
  if (status === "filed" || status === "approved" || status === "ready") stamps.filed_at = iso;
  if (status === "approved" || status === "ready") stamps.approved_at = iso;
  return stamps;
}
