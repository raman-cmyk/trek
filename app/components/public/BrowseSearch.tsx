import { Form } from "react-router";

/**
 * The browse search bar: free text + a date range, on one row.
 *
 * Both browse lanes get the same primitive so "Annapurna, October" behaves
 * identically whether you came in looking for a person or for a trip. Native
 * date inputs on purpose — every phone already renders a good picker and the
 * guide-facing rule (cheap Android, 3G) applies to trekkers on the trail too.
 *
 * Filters that live outside the search row are passed through as hidden inputs
 * so submitting a search doesn't silently drop the category you picked.
 */
export function BrowseSearch({
  q,
  from,
  to,
  today,
  placeholder,
  dateLabel,
  hidden,
  children,
}: {
  q: string;
  from: string;
  to: string;
  today: string;
  placeholder: string;
  /** e.g. "Free between" (guides) or "Departing between" (experiences). */
  dateLabel: string;
  hidden?: Record<string, string>;
  /** Extra selects rendered on the row below the search field. */
  children?: React.ReactNode;
}) {
  return (
    <Form method="get" className="mt-5">
      {Object.entries(hidden ?? {}).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}

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
            defaultValue={q}
            placeholder={placeholder}
            aria-label="Search"
            className="w-full bg-transparent py-2 text-base text-ink outline-none placeholder:text-muted"
          />
        </div>

        {/* The label wraps onto its own line on a phone — two bare date fields
            with no caption are the sort of thing only the person who built it
            can read. */}
        <div className="flex flex-wrap items-center gap-x-1.5 border-line px-2 sm:border-l">
          <span className="shrink-0 basis-full text-caption text-muted sm:basis-auto">
            {dateLabel}
          </span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            min={today}
            aria-label={`${dateLabel} — first day`}
            className="min-w-0 flex-1 bg-transparent py-2 font-mono text-sm text-ink outline-none"
          />
          <span aria-hidden="true" className="text-muted">
            –
          </span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            min={from || today}
            aria-label={`${dateLabel} — last day`}
            className="min-w-0 flex-1 bg-transparent py-2 font-mono text-sm text-ink outline-none"
          />
        </div>

        <button className="shrink-0 rounded bg-pine px-5 py-2.5 text-sm font-medium text-paper hover:bg-moss">
          Search
        </button>
      </div>

      {children && <div className="mt-2 flex flex-wrap gap-2">{children}</div>}
    </Form>
  );
}
