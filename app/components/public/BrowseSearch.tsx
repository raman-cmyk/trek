import { useState } from "react";
import { Form } from "react-router";
import { cn } from "~/lib/cn";
import { DateField } from "~/components/public/DateField";

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
  // On a phone the search bar is one row: input + Search. Dates and the
  // filter selects fold behind one chip — a form stack taller than the first
  // guide card is what made browse read as a page instead of an app. Starts
  // open when a filter is already applied, so state is never hidden.
  const [open, setOpen] = useState(Boolean(from || to));
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

        {/* Two dates that look like two dates.
            They were transparent inputs with no border and no background,
            with the word "From" floating in grey behind each — so the whole
            control read as the sentence "Departing between From – To" and the
            founder's note was that it "needs to be much more clear". Each half
            is a bordered field with its own visible caption now, and the caption
            says what a date means here rather than repeating the direction:
            "Leave after", "Back by". */}
        <div
          className={cn(
            "flex-wrap items-end gap-2 border-line px-2 sm:flex sm:border-l",
            open ? "flex" : "hidden",
          )}
        >
          <span className="shrink-0 basis-full text-caption text-muted sm:basis-auto sm:self-center">
            {dateLabel}
          </span>
          <label className="min-w-0 flex-1 sm:flex-none">
            <span className="mb-0.5 block text-caption text-muted">Earliest</span>
            <DateField
              name="from"
              defaultValue={from}
              min={today}
              placeholder="Any day"
              className="w-full min-w-0 rounded border border-line bg-paper px-3 py-2 font-mono text-sm text-ink outline-none focus:border-moss sm:w-36"
            />
          </label>
          <label className="min-w-0 flex-1 sm:flex-none">
            <span className="mb-0.5 block text-caption text-muted">Latest</span>
            <DateField
              name="to"
              defaultValue={to}
              min={from || today}
              placeholder="Any day"
              className="w-full min-w-0 rounded border border-line bg-paper px-3 py-2 font-mono text-sm text-ink outline-none focus:border-moss sm:w-36"
            />
          </label>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex-1 rounded border border-line px-4 py-2.5 text-sm text-ink active:bg-mist sm:hidden"
          >
            {open ? "Fewer options" : "Dates & filters"}
          </button>
          <button className="flex-1 shrink-0 rounded bg-pine px-5 py-2.5 text-sm font-medium text-paper hover:bg-moss sm:flex-none">
            Search
          </button>
        </div>
      </div>

      {children && (
        <div className={cn("mt-2 flex-wrap gap-2 sm:flex", open ? "flex" : "hidden")}>
          {children}
        </div>
      )}
    </Form>
  );
}
