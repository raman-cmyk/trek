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

export type FilterKey = "all" | "ready" | "rejected" | "awaiting" | "in_flight";

export const PERMIT_FILTERS: Array<{ key: FilterKey; label: string; statuses: PermitStatus[] }> = [
  { key: "all", label: "All", statuses: [...PERMIT_STATUSES] },
  { key: "awaiting", label: "Awaiting documents", statuses: ["awaiting_docs"] },
  // Filed and approved are both "with the office, not back yet" — one answer
  // to one question, rather than two tabs nobody would think to compare.
  { key: "in_flight", label: "With the department", statuses: ["filed", "approved"] },
  { key: "ready", label: "Ready", statuses: ["ready"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected"] },
];

export function isFilterKey(v: string | null | undefined): v is FilterKey {
  return PERMIT_FILTERS.some((f) => f.key === v);
}

export function statusesFor(key: FilterKey): PermitStatus[] {
  return PERMIT_FILTERS.find((f) => f.key === key)?.statuses ?? [...PERMIT_STATUSES];
}

export function matchesFilter(status: string, key: FilterKey): boolean {
  return statusesFor(key).includes(status as PermitStatus);
}

/** How many rows each tab would show, so the tab can say so before it is clicked. */
export function filterCounts(rows: Array<{ status: string }>): Record<FilterKey, number> {
  const counts = {} as Record<FilterKey, number>;
  for (const f of PERMIT_FILTERS) {
    counts[f.key] = rows.filter((r) => matchesFilter(r.status, f.key)).length;
  }
  return counts;
}

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
