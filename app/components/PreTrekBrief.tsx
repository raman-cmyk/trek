import { preTrekBrief, type TripFacts } from "~/lib/pre-trek";

/**
 * "A few quick things before the trek."
 *
 * Folded shut by default, one line of hint showing, because twenty-odd
 * paragraphs open on a phone is a wall nobody reads — and the first section
 * open, because a section that is entirely shut looks like an empty page.
 * Native <details>, so it works with no JavaScript and the browser's own
 * find-in-page can still reach inside it.
 */
export function PreTrekBrief({ trip }: { trip: TripFacts }) {
  const sections = preTrekBrief(trip);
  return (
    <div className="space-y-2">
      {sections.map((s, i) => (
        <details
          key={s.key}
          open={i === 0}
          className="group rounded-card border border-border bg-card p-4 [&_summary::-webkit-details-marker]:hidden"
        >
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block font-medium text-ink">{s.title}</span>
              <span className="mt-0.5 block text-sm text-ink-soft group-open:hidden">
                {s.hint}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="mt-1 shrink-0 text-ink-soft transition-transform group-open:rotate-180"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </summary>

          <ul className="mt-3 space-y-3 border-t border-border pt-3">
            {s.items.map((it) => (
              <li key={it.key}>
                <p className="text-sm font-medium text-ink">{it.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{it.body}</p>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
