import { cn } from "~/lib/cn";

/**
 * Read-only month grid (docs/04 AvailabilityCalendar, trekker view). Open days
 * are highlighted; everything else is muted. Pure/SSR — takes a set of open
 * ISO-date strings and renders the next two months.
 */
export function AvailabilityCalendar({
  openDays,
  monthsFrom,
}: {
  openDays: string[];
  /** First-of-month ISO anchor (yyyy-mm-01) computed on the server. */
  monthsFrom: string;
}) {
  const open = new Set(openDays);
  // One class string, used by the grid AND the key, so the swatch can never
  // drift from the thing it explains.
  const dayCls = (isOpen: boolean) =>
    cn("rounded py-1", isOpen ? "bg-accent/15 font-medium text-accent" : "text-ink-soft/40");
  const [y0, m0] = monthsFrom.split("-").map(Number);
  const months = [0, 1].map((offset) => {
    const d = new Date(Date.UTC(y0, m0 - 1 + offset, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });

  return (
    <div>
      {/* One tiny key. Colour alone is never a label — a green square and a
          grey square mean nothing until you say which is which. */}
      <ul className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-caption text-muted">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className={cn(dayCls(true), "w-7 text-center text-xs")}>
            12
          </span>
          Free to book
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className={cn(dayCls(false), "w-7 text-center text-xs")}>
            12
          </span>
          Already booked, or kept free
        </li>
      </ul>

      <div className="grid gap-6 sm:grid-cols-2">
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
                const isOpen = open.has(iso);
                return (
                  <span
                    key={iso}
                    title={isOpen ? "Free to book" : "Not available"}
                    className={dayCls(isOpen)}
                  >
                    {i + 1}
                    <span className="sr-only">
                      {isOpen ? " — free to book" : " — not available"}
                    </span>
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
