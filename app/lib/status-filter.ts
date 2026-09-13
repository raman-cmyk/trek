/**
 * Filtering a list of work by status, the same way on every console page.
 *
 * Ops pages are queues, and a queue sorted by urgency is the right thing to
 * work through and the wrong thing to ask a question of: "which guides are
 * waiting on review" meant reading the whole of /ops/people. Two pages had a
 * bespoke answer to this — a dropdown beside the search box on People, tabs on
 * the permit tracker — and everywhere else there was nothing.
 *
 * One shape, so a filter looks and behaves identically wherever it appears:
 * a list of named groups over a status column, a count on each, and the choice
 * kept in the URL so a shift can be handed over with a link.
 */

export interface StatusFilter {
  /** URL value. "all" is the conventional default and shows everything. */
  key: string;
  label: string;
  /** Statuses this group covers. Empty means every status. */
  statuses: string[];
}

/**
 * The "all" group, which every list starts with.
 *
 * Its status list is deliberately empty, which this module reads as "every
 * row". Spelling out the known statuses instead would quietly drop rows whose
 * status is null or something nobody has heard of — a guide row that never
 * got a guide record, say — from the one view that is supposed to hold
 * everything. "All" has to mean all.
 */
export function allOf(label = "All"): StatusFilter {
  return { key: "all", label, statuses: [] };
}

export function isKey(filters: StatusFilter[], raw: string | null | undefined): boolean {
  return !!raw && filters.some((f) => f.key === raw);
}

/** The chosen group, or "all" when the URL says something we do not recognise. */
export function resolveKey(filters: StatusFilter[], raw: string | null | undefined): string {
  return isKey(filters, raw) ? (raw as string) : "all";
}

export function statusesFor(filters: StatusFilter[], key: string): string[] {
  const found = filters.find((f) => f.key === key);
  if (!found) return filters.flatMap((f) => f.statuses);
  return found.statuses;
}

export function matchesStatus(
  filters: StatusFilter[],
  key: string,
  status: string | null | undefined,
): boolean {
  const wanted = statusesFor(filters, key);
  // An empty group means "everything", which is how a list with an unknown
  // status column still shows its rows rather than going silently blank.
  if (wanted.length === 0) return true;
  return wanted.includes(String(status ?? ""));
}

/**
 * How many rows each group holds.
 *
 * On the tab before it is clicked, so the shape of the queue is readable
 * without opening five tabs to find the four empty ones.
 */
export function countsFor<T>(
  rows: T[],
  filters: StatusFilter[],
  statusOf: (row: T) => string | null | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of filters) {
    counts[f.key] = rows.filter((r) => matchesStatus(filters, f.key, statusOf(r))).length;
  }
  return counts;
}

/** Apply the chosen group to the rows. */
export function applyFilter<T>(
  rows: T[],
  filters: StatusFilter[],
  key: string,
  statusOf: (row: T) => string | null | undefined,
): T[] {
  return rows.filter((r) => matchesStatus(filters, key, statusOf(r)));
}

/**
 * Statuses present in the data that no group covers.
 *
 * A status added to the database and not to a filter list would vanish from
 * every tab except All — quietly, and only for whoever happened to look. This
 * is how a test catches that instead of a person.
 */
export function uncovered(filters: StatusFilter[], statuses: string[]): string[] {
  const covered = new Set(filters.flatMap((f) => (f.key === "all" ? [] : f.statuses)));
  return [...new Set(statuses)].filter((s) => !covered.has(s));
}
