import { Form, Link } from "react-router";
import {
  activeCount,
  activeFilters,
  clearedParams,
  filterButtonLabel,
  groupEmpty,
  isOn,
  resultsLabel,
  withoutFilter,
  type FilterGroup,
} from "~/lib/filters";
import { cn } from "~/lib/cn";

/**
 * The filter panel, one of them, for all three browse pages.
 *
 * "The filter should open as shown on Viator to make the filtering process
 * more appealing" — a titled dialog of grouped choices with Clear all on one
 * side and "See 429 results" on the other, rather than a row of pills that
 * runs out of room at the fourth filter.
 *
 * Built on <details> rather than a JavaScript dialog. It opens and closes
 * with no script running, the controls are plain form fields, and Apply is a
 * GET submit — so a filtered page stays a link somebody can send to the
 * friend they are going with, and the page still works with JavaScript off,
 * which is the house rule for anything public.
 *
 * Things the page owns rather than this panel — the search box, the dates,
 * the sort — ride along as hidden fields so applying a filter never silently
 * throws away what somebody typed.
 */
export function FilterSheet({
  groups,
  params,
  resultCount,
  action,
  keep = ["q", "from", "to", "sort", "party", "intent"],
}: {
  groups: FilterGroup[];
  /** The current query string. */
  params: URLSearchParams;
  /** How many rows match right now, for the button at the bottom. */
  resultCount: number;
  /** Where the form submits. Defaults to the current page. */
  action?: string;
  /** Params the panel must carry through untouched. */
  keep?: string[];
}) {
  const count = activeCount(params, groups);
  const chips = activeFilters(params, groups);
  const cleared = clearedParams(params, groups);
  const clearedHref = cleared.toString() ? `?${cleared}` : "?";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <details className="filter-sheet">
        <summary
          className="inline-flex cursor-pointer list-none items-center gap-2 rounded-pill border border-line bg-card px-4 py-2 text-sm font-medium text-ink hover:border-sage"
          aria-label={filterButtonLabel(count)}
        >
          <SlidersGlyph />
          {filterButtonLabel(count)}
        </summary>

        {/* The dim behind the panel. A label rather than a div so tapping it
            closes the details — no script involved. */}
        <div className="filter-backdrop" aria-hidden="true" />

        <div className="filter-panel" role="dialog" aria-label="Filter">
          <Form method="get" action={action} className="flex h-full flex-col">
            {keep.map((k) =>
              params.getAll(k).map((v, i) =>
                v ? <input key={`${k}-${i}`} type="hidden" name={k} value={v} /> : null,
              ),
            )}

            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <p className="font-display text-lg text-ink">Filter</p>
              {/* Closes the details without script: a link back to the same
                  page. Styled as the X it looks like. */}
              <Link
                to={params.toString() ? `?${params}` : "?"}
                aria-label="Close"
                className="rounded-full p-1.5 text-muted hover:bg-mist hover:text-ink"
              >
                <CloseGlyph />
              </Link>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {/* The rule lives on the wrapper, not the fieldset: a border on
                  a fieldset is drawn straight through its own legend. */}
              {groups.map((g, i) => (
                <div key={g.param} className={cn(i > 0 && "mt-5 border-t border-line pt-5")}>
                  <fieldset>
                    <legend className="text-sm font-medium text-ink">{g.title}</legend>
                    <Options group={g} params={params} />
                  </fieldset>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5">
              <Link
                to={clearedHref}
                className="text-sm text-ink underline underline-offset-4 hover:text-moss"
              >
                Clear all
              </Link>
              <button
                type="submit"
                className="rounded-button bg-moss px-5 py-2.5 text-sm font-medium text-white hover:bg-pine"
              >
                {resultsLabel(resultCount)}
              </button>
            </div>
          </Form>
        </div>
      </details>

      {/* The chips. Viator keeps what you chose visible outside the dialog,
          and it is the difference between a page you can back out of and one
          you have to reopen a panel to understand. */}
      {chips.map((c) => (
        <Link
          key={`${c.param}-${c.value}`}
          to={`?${withoutFilter(params, c.param, c.value)}`}
          className="inline-flex items-center gap-1.5 rounded-pill border border-sage bg-mist px-3 py-1.5 text-sm text-ink hover:border-moss"
        >
          {c.label}
          <span aria-hidden="true" className="text-muted">
            ×
          </span>
          <span className="sr-only">— remove this filter</span>
        </Link>
      ))}

      {count > 0 && (
        <Link
          to={clearedHref}
          className="text-sm text-muted underline underline-offset-4 hover:text-ink"
        >
          Clear all
        </Link>
      )}
    </div>
  );
}

/**
 * One group's controls.
 *
 * Two columns like Viator's, because a list of twelve languages down one side
 * of a dialog is a scroll, and a "Show more" past the first few so the panel
 * opens at a readable height.
 */
function Options({ group, params }: { group: FilterGroup; params: URLSearchParams }) {
  const many = group.type === "many";
  const first = group.showFirst ?? group.options.length;
  const head = group.options.slice(0, first);
  const rest = group.options.slice(first);

  const control = (o: { value: string; label: string; hint?: string; count?: number }) => (
    <label key={o.value} className="flex items-start gap-2 py-1.5 text-sm">
      <input
        type={many ? "checkbox" : "radio"}
        name={group.param}
        value={o.value}
        defaultChecked={isOn(params, group, o.value)}
        className="mt-0.5 shrink-0"
      />
      <span className="min-w-0">
        <span className="text-ink">{o.label}</span>
        {typeof o.count === "number" && (
          <span className="text-muted"> ({o.count})</span>
        )}
        {o.hint && <span className="block text-caption text-muted">{o.hint}</span>}
      </span>
    </label>
  );

  return (
    <>
      <div className="mt-1 grid gap-x-6 sm:grid-cols-2">
        {/* The way out of a radio group. A checkbox group does not need one —
            unticking everything is the same answer — but a radio, once
            pressed, can never be unpressed. */}
        {!many && (
          <label className="flex items-start gap-2 py-1.5 text-sm">
            <input
              type="radio"
              name={group.param}
              value=""
              defaultChecked={groupEmpty(params, group)}
              className="mt-0.5 shrink-0"
            />
            <span className="text-ink">{group.anyLabel ?? "Any"}</span>
          </label>
        )}
        {head.map(control)}
      </div>
      {rest.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-sm text-moss">
            Show {rest.length} more
          </summary>
          <div className="grid gap-x-6 sm:grid-cols-2">{rest.map(control)}</div>
        </details>
      )}
    </>
  );
}

function SlidersGlyph() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M3 6h9M15 6h2M3 14h2M8 14h9" />
      <circle cx="13.5" cy="6" r="1.8" />
      <circle cx="6.5" cy="14" r="1.8" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
    </svg>
  );
}
