import { useState } from "react";
import { Form, Link } from "react-router";
import { cn } from "~/lib/cn";
import { copy } from "~/lib/copy";
import { monthName } from "~/lib/match";
import { DAY_BANDS, isNarrowed, type RouteFilters } from "~/lib/route-search";

/**
 * The search bar on the routes page.
 *
 * A route has no availability to search — it is a mountain, not a seat — so
 * this is not BrowseSearch with its date range. What a reader has instead is
 * a name they half remember, a month they can travel, how long they can be
 * away, and how hard they want it to be. Those are the four controls.
 *
 * A plain GET form: it renders whole on the server, works with the
 * JavaScript switched off, and every result is a URL somebody can send to
 * the person they are going with. On a phone the box is one row and the
 * three selects fold behind a chip, open already when a filter is applied so
 * no filter is ever hidden from the person it is affecting.
 */
export function RouteSearch({
  filters,
  regions,
  difficulties,
}: {
  filters: RouteFilters;
  regions: string[];
  difficulties: string[];
}) {
  const narrowed = isNarrowed(filters);
  const [open, setOpen] = useState(
    Boolean(filters.region || filters.difficulty || filters.days || filters.month),
  );
  const select = "rounded border border-line bg-card px-3 py-2 text-sm text-ink";

  return (
    <Form method="get" className="mt-6">
      <div className="flex flex-col gap-2 rounded-md border border-line bg-card p-2 sm:flex-row sm:items-stretch">
        <div className="flex flex-1 items-center gap-2 px-2">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-4 w-4 shrink-0 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="9" cy="9" r="6" />
            <path d="m14 14 4 4" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder={copy.routes.searchPlaceholder}
            aria-label={copy.routes.searchLabel}
            className="w-full bg-transparent py-2 text-base text-ink outline-none placeholder:text-muted"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex-1 rounded border border-line px-4 py-2.5 text-sm text-ink active:bg-mist sm:hidden"
          >
            {open ? copy.routes.fewerFilters : copy.routes.moreFilters}
          </button>
          <button className="flex-1 shrink-0 rounded bg-pine px-5 py-2.5 text-sm font-medium text-paper hover:bg-moss sm:flex-none">
            {copy.routes.search}
          </button>
        </div>
      </div>

      <div className={cn("mt-2 flex-wrap gap-2 sm:flex", open ? "flex" : "hidden")}>
        <select name="month" defaultValue={filters.month} aria-label={copy.routes.monthLabel} className={select}>
          <option value="">{copy.routes.anyMonth}</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {copy.routes.goingIn.replace("{month}", monthName(m))}
            </option>
          ))}
        </select>
        <select name="days" defaultValue={filters.days} aria-label={copy.routes.daysLabel} className={select}>
          <option value="">{copy.routes.anyLength}</option>
          {DAY_BANDS.map((b) => (
            <option key={b.key} value={b.key}>
              {b.label}
            </option>
          ))}
        </select>
        <select
          name="difficulty"
          defaultValue={filters.difficulty}
          aria-label={copy.routes.difficultyLabel}
          className={select}
        >
          <option value="">{copy.routes.anyDifficulty}</option>
          {difficulties.map((d) => (
            <option key={d} value={d} className="capitalize">
              {d}
            </option>
          ))}
        </select>
        <select name="region" defaultValue={filters.region} aria-label={copy.routes.regionLabel} className={select}>
          <option value="">{copy.routes.anyRegion}</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {narrowed && (
          <Link
            to="/routes"
            className="self-center px-2 py-2 text-sm text-moss underline underline-offset-4"
          >
            {copy.routes.clear}
          </Link>
        )}
      </div>
    </Form>
  );
}
