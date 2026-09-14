import { cn } from "~/lib/cn";

/**
 * Read-only month grid (docs/04 AvailabilityCalendar, trekker view). Pure/SSR.
 *
 * Two states on a guide's profile: free, or not. Three on a trip page, where
 * "the guide is free" and "this trip can start" are different questions — a
 * 14-day trek needs fourteen consecutive open days, so most of a guide's free
 * days cannot begin it. Showing that gap is the point: the profile advertised
 * 76 open days and the trek page offered a handful of dates, with nothing
 * anywhere explaining why.
 */
export function AvailabilityCalendar({
  openDays,
  startDays,
  monthsFrom,
  months: monthCount = 2,
}: {
  openDays: string[];
  /**
   * Days this particular trip can start. Omit on a guide's profile, which is
   * not about any one trip.
   */
  startDays?: string[];
  /** First-of-month ISO anchor (yyyy-mm-01) computed on the server. */
  monthsFrom: string;
  /** How many months to draw. Three on a trip page, two on a profile. */
  months?: number;
}) {
  const open = new Set(openDays);
  const canStart = startDays ? new Set(startDays) : null;
  // One class string, used by the grid AND the key, so the swatch can never
  // drift from the thing it explains.
  const dayCls = (state: "start" | "open" | "closed") =>
    cn(
      "rounded py-1",
      state === "start"
        ? "bg-accent/15 font-medium text-accent"
        : state === "open"
          ? "bg-mist font-medium text-ink-soft"
          : "text-ink-soft/40",
    );
  // On a profile every open day is bookable, so it gets the strong colour;
  // on a trip page only the days this trip can start do.
  const stateOf = (iso: string): "start" | "open" | "closed" => {
    if (!open.has(iso)) return "closed";
    if (!canStart) return "start";
    return canStart.has(iso) ? "start" : "open";
  };
  const [y0, m0] = monthsFrom.split("-").map(Number);
  const months = Array.from({ length: monthCount }, (_, offset) => {
    const d = new Date(Date.UTC(y0, m0 - 1 + offset, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });

  return (
    <div>
      {/* One tiny key. Colour alone is never a label — a green square and a
          grey square mean nothing until you say which is which. */}
      <ul className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-caption text-muted">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className={cn(dayCls("start"), "w-7 text-center text-xs")}>
            12
          </span>
          {canStart ? "This trip can start" : "Free to book"}
        </li>
        {canStart && (
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className={cn(dayCls("open"), "w-7 text-center text-xs")}>
              12
            </span>
            Free, but too close to the next booking
          </li>
        )}
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className={cn(dayCls("closed"), "w-7 text-center text-xs")}>
            12
          </span>
          Already booked, or kept free
        </li>
      </ul>

      <div className={cn("grid gap-6 sm:grid-cols-2", monthCount > 2 && "lg:grid-cols-3")}>
      {months.map(({ year, month }) => {
        const first = new Date(Date.UTC(year, month, 1));
        const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
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
              {Array.from({ length: days }).map((_, i) => {
                const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
                const state = stateOf(iso);
                const words =
                  state === "start"
                    ? canStart
                      ? "this trip can start"
                      : "free to book"
                    : state === "open"
                      ? "free, but this trip cannot start here"
                      : "not available";
                return (
                  <span key={iso} title={words} className={dayCls(state)}>
                    {i + 1}
                    <span className="sr-only"> — {words}</span>
                  </span>
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
