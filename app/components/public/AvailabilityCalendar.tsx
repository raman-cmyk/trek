import { cn } from "~/lib/cn";
import { canStart, firstTakenDay, spanDays, spanEnd } from "~/lib/date-span";

/**
 * The guide's month grid — read-only by default, and pickable when the page
 * gives it something to do.
 *
 * Two shapes, one component: the wide one further down the page, and a single
 * narrow month in the decision rail. Dates are the question every visitor
 * actually has, and having to scroll past the whole profile to reach them was
 * asking people to hunt for the one thing they came for.
 *
 * Picking, when it is on, is the founder's ask: "I as a client should be able
 * to select the dates I want to go on a trek before clicking request to book,
 * so I can have a visual representation on the trek's timeline." A dropdown of
 * start dates cannot show you that a twelve-day walk from the 20th runs to the
 * 31st, or that the guide is busy on the 27th of it.
 *
 * Two ways to pick, because the two pages ask different questions:
 *   span  — a trip of a known length. Click a start; the rest follows.
 *   range — no trip chosen yet. Click a start, then an end.
 */
export function AvailabilityCalendar({
  openDays,
  monthsFrom,
  months: monthCount = 2,
  compact = false,
  select,
  days,
  value,
  onPick,
}: {
  openDays: string[];
  /** First-of-month ISO anchor (yyyy-mm-01) computed on the server. */
  monthsFrom: string;
  /** How many months from the anchor. One fits the rail; two fit the page. */
  months?: number;
  /** Rail sizing: smaller type, months stacked, no legend of its own. */
  compact?: boolean;
  /** Off by default — the page opts in to picking. */
  select?: "span" | "range";
  /** How long the trip is, in span mode. */
  days?: number;
  /** What is chosen now. In span mode only `start` is read. */
  value?: { start: string | null; end: string | null };
  onPick?: (next: { start: string | null; end: string | null }) => void;
}) {
  const open = new Set(openDays);
  const picking = !!select && !!onPick;
  const tripDays = Math.max(1, Math.floor(days || 1));
  const start = value?.start ?? null;
  const end = value?.end ?? null;

  // The days currently painted as chosen. In span mode the end is derived, so
  // there is one source of truth for "how long is this trip" and the calendar
  // cannot disagree with the price beside it.
  const chosen = new Set<string>(
    start
      ? select === "span"
        ? spanDays(start, tripDays)
        : end
          ? spanDays(start, dayGap(start, end))
          : [start]
      : [],
  );
  const lastChosen = start
    ? select === "span"
      ? spanEnd(start, tripDays)
      : (end ?? start)
    : null;

  function pick(iso: string) {
    if (!onPick) return;
    if (select === "span") {
      onPick({ start: iso, end: spanEnd(iso, tripDays) });
      return;
    }
    // Range: first click starts, second click closes it. Clicking before the
    // start, or clicking the start again, begins a new range rather than
    // making an impossible one.
    if (!start || end || iso < start) onPick({ start: iso, end: null });
    else onPick({ start, end: iso });
  }

  /**
   * Is this day one you could still begin a trip on? A free day near the end
   * of a short run is no use as the start of a twelve-day walk, and offering
   * it only to refuse the request is how people give up on a page.
   */
  const startable = (iso: string) =>
    select !== "span" || canStart(iso, tripDays, open);

  const dayCls = (isOpen: boolean) =>
    cn("rounded py-1", isOpen ? "bg-accent/15 font-medium text-accent" : "text-ink-soft/40");

  const [y0, m0] = monthsFrom.split("-").map(Number);
  const months = Array.from({ length: Math.max(monthCount, 1) }, (_, offset) => {
    const d = new Date(Date.UTC(y0, m0 - 1 + offset, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });

  return (
    <div>
      {/* One tiny key. Colour alone is never a label — a green square and a
          grey square mean nothing until you say which is which. */}
      <ul
        className={cn(
          "mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-caption text-muted",
          compact && "gap-x-3",
        )}
      >
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className={cn(dayCls(true), "w-7 text-center text-xs")}>
            12
          </span>
          Free{compact ? "" : " to book"}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className={cn(dayCls(false), "w-7 text-center text-xs")}>
            12
          </span>
          {compact ? "Taken" : "Already booked, or kept free"}
        </li>
        {picking && (
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="w-7 rounded bg-pine py-1 text-center text-xs font-medium text-paper"
            >
              12
            </span>
            Your dates
          </li>
        )}
      </ul>

      <div className={cn("grid gap-6", !compact && "sm:grid-cols-2")}>
      {months.map(({ year, month }) => {
        const first = new Date(Date.UTC(year, month, 1));
        const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const lead = first.getUTCDay();
        return (
          <div key={`${year}-${month}`}>
            <p className="mb-2 text-sm font-medium">
              {first.toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </p>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <span key={i} className="text-ink-soft">
                  {d}
                </span>
              ))}
              {Array.from({ length: lead }).map((_, i) => (
                <span key={`lead-${i}`} />
              ))}
              {Array.from({ length: dayCount }).map((_, i) => {
                const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
                const isOpen = open.has(iso);
                const isChosen = chosen.has(iso);
                const canPick = picking && isOpen && startable(iso);

                // Painted as chosen: the whole walk, not just the day pressed.
                // The ends are rounded so a span reads as one bar with a
                // beginning and an end rather than twelve separate squares.
                const chosenCls = cn(
                  "bg-pine font-medium text-paper",
                  iso === start && "rounded-l",
                  iso === lastChosen && "rounded-r",
                  iso !== start && iso !== lastChosen && "rounded-none",
                );

                const cls = cn(
                  // Taller when it is something you tap: a 22px row is a fine
                  // thing to read and a poor thing to hit with a thumb.
                  picking ? "py-2" : "py-1",
                  isChosen ? chosenCls : dayCls(isOpen),
                  canPick && !isChosen && "cursor-pointer hover:bg-accent/30",
                  // Free, but no trip of this length fits from here. Shown as
                  // free-but-dimmed rather than hidden: the guide IS free, and
                  // pretending otherwise would contradict the day beside it.
                  picking && isOpen && !startable(iso) && !isChosen && "opacity-40",
                );

                const why = !isOpen
                  ? "Not available"
                  : select === "span" && !startable(iso)
                    ? `The trip would run into ${labelOf(firstTakenDay(iso, tripDays, open))}, which is not free`
                    : isChosen
                      ? "Part of your dates"
                      : "Free to book";

                if (!picking || !isOpen) {
                  return (
                    <span key={iso} title={why} className={cls}>
                      {i + 1}
                      <span className="sr-only">
                        {isOpen ? " — free to book" : " — not available"}
                      </span>
                    </span>
                  );
                }

                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => canPick && pick(iso)}
                    disabled={!canPick}
                    aria-pressed={isChosen}
                    title={why}
                    className={cn(cls, "disabled:cursor-not-allowed")}
                  >
                    {i + 1}
                    <span className="sr-only">
                      {isChosen ? " — part of your dates" : ` — ${why.toLowerCase()}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

function labelOf(iso: string | null): string {
  if (!iso) return "a booked day";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Whole days from a to b, inclusive — 20th to 22nd is three days. */
function dayGap(a: string, b: string): number {
  const ms = Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z");
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}
