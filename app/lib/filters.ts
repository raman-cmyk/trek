/**
 * Filters, declared once and rendered the same way everywhere.
 *
 * "The filter should open as shown on Viator to make the filtering process
 * more appealing. This needs to be on the Guide, Experience, and Routes
 * pages, ensuring the pre-existing filters display exactly as they do on the
 * Viator page."
 *
 * Three pages had three different filter UIs — pills on one, selects on
 * another, nothing at all on the third — because each was built when that
 * page was built. Describing a page's filters as data rather than as markup
 * is what lets one panel serve all three, and what stops the fourth page
 * inventing a fourth style.
 *
 * Everything here is about the URL. A filtered page is a link somebody can
 * send to the friend they are going with, and every control is a plain form
 * field with a name — so the panel works with JavaScript off, which is the
 * house rule for public pages.
 */

export interface FilterOption {
  value: string;
  label: string;
  /** The small grey line under an option — "Starts before 12pm". */
  hint?: string;
  /** How many results this option would leave. Omitted when unknown. */
  count?: number;
}

export interface FilterGroup {
  /** The query parameter this group writes. */
  param: string;
  title: string;
  /**
   * "one" renders radios and keeps the existing single-value params working;
   * "many" renders checkboxes and reads back as a list. Declared per group
   * rather than assumed, because a trip has one kind and a guide has several
   * languages, and pretending otherwise breaks one of them.
   */
  type: "one" | "many";
  options: FilterOption[];
  /** The radio that means "do not filter on this". Ignored when type is many. */
  anyLabel?: string;
  /** Collapse past this many options behind a "Show more". */
  showFirst?: number;
}

/** Is this option currently on? */
export function isOn(
  params: URLSearchParams,
  group: FilterGroup,
  value: string,
): boolean {
  if (group.type === "many") return params.getAll(group.param).includes(value);
  const current = params.get(group.param) ?? "";
  return current === value;
}

/** Nothing chosen in this group. */
export function groupEmpty(params: URLSearchParams, group: FilterGroup): boolean {
  if (group.type === "many") return params.getAll(group.param).length === 0;
  return !(params.get(group.param) ?? "");
}

/**
 * Everything currently filtered on, as chips you can remove one at a time.
 *
 * Options no longer offered — a district with no guides left in it, a value
 * somebody typed into the URL — are dropped rather than shown as a chip that
 * cannot be explained.
 */
export function activeFilters(
  params: URLSearchParams,
  groups: FilterGroup[],
): { param: string; value: string; label: string }[] {
  const out: { param: string; value: string; label: string }[] = [];
  for (const g of groups) {
    const values = g.type === "many" ? params.getAll(g.param) : [params.get(g.param) ?? ""];
    for (const v of values) {
      if (!v) continue;
      const opt = g.options.find((o) => o.value === v);
      if (opt) out.push({ param: g.param, value: v, label: opt.label });
    }
  }
  return out;
}

export function activeCount(params: URLSearchParams, groups: FilterGroup[]): number {
  return activeFilters(params, groups).length;
}

/**
 * The URL with every filter cleared but the rest of the page kept.
 *
 * A search somebody typed, the dates they are free, and the sort they chose
 * are not filters, and clearing the filters should not throw them away.
 */
export function clearedParams(
  params: URLSearchParams,
  groups: FilterGroup[],
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const g of groups) next.delete(g.param);
  next.delete("page");
  return next;
}

/** The URL with one chip removed and everything else left alone. */
export function withoutFilter(
  params: URLSearchParams,
  param: string,
  value: string,
): URLSearchParams {
  const next = new URLSearchParams();
  for (const [k, v] of params.entries()) {
    if (k === param && v === value) continue;
    next.append(k, v);
  }
  next.delete("page");
  return next;
}

/** "See 429 results" — the button at the bottom of the panel. */
export function resultsLabel(n: number): string {
  if (n <= 0) return "No matches";
  return n === 1 ? "See 1 result" : `See ${n.toLocaleString("en-US")} results`;
}

/** "Filters" · "Filters (3)" — the button that opens it. */
export function filterButtonLabel(n: number): string {
  return n > 0 ? `Filters (${n})` : "Filters";
}

/**
 * Options built from what is actually there, newest data first.
 *
 * Offering a language nobody speaks or a district with no guides is a dead
 * end dressed up as a choice, so the lists on these pages are derived from
 * the rows rather than written down.
 */
export function optionsFromValues(
  values: (string | null | undefined)[],
  label: (v: string) => string = (v) => v,
): FilterOption[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = (v ?? "").trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: label(value), count }))
    .sort((a, b) => b.count! - a.count! || a.label.localeCompare(b.label));
}
