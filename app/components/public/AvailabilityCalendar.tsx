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
  const [y0, m0] = monthsFrom.split("-").map(Number);
  const months = [0, 1].map((offset) => {
    const d = new Date(Date.UTC(y0, m0 - 1 + offset, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });

  return (
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
                    className={cn(
                      "rounded py-1",
                      isOpen
                        ? "bg-accent/10 font-medium text-accent"
                        : "text-ink-soft/40",
                    )}
                  >
                    {i + 1}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
