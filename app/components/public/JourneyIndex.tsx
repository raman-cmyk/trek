import { Link } from "react-router";
import type { Chapter, ReadingDay } from "~/lib/journal-reading";
import { cn } from "~/lib/cn";

/**
 * Fifteen days, as a menu.
 *
 * A journey page is a long scroll — eleven thousand pixels for a fortnight on
 * Everest — and until now the only way to reach day nine was the wheel. The
 * days already carry `#day-N` anchors, so this is plain links: it works with
 * JavaScript off, it costs nothing, and it fills the column on the right that
 * was otherwise empty from the third day down.
 *
 * Grouped by chapter when the trek has chapters, because "Going higher" tells
 * a reader more about where day seven sits than the number seven does.
 */
export function JourneyIndex({
  days,
  chapters,
  className,
}: {
  days: ReadingDay[];
  chapters: Chapter[];
  className?: string;
}) {
  if (days.length < 4) return null;

  const groups = chapters.length
    ? chapters.map((c) => ({
        title: c.title,
        days: days.slice(c.firstIndex, c.lastIndex + 1),
      }))
    : [{ title: null as string | null, days }];

  return (
    <nav className={cn("rounded-md border border-line bg-card p-4", className)} aria-label="The days">
      <p className="label text-muted">On this page</p>
      <ol className="mt-3 space-y-3">
        {groups.map((g, gi) => (
          <li key={g.title ?? gi}>
            {g.title && (
              <p className="font-mono text-caption uppercase tracking-[0.08em] text-moss">
                {g.title}
              </p>
            )}
            <ul className={cn(g.title && "mt-1.5", "space-y-1")}>
              {g.days.map((d) => (
                <li key={d.day_no}>
                  <Link
                    to={`#day-${d.day_no}`}
                    className="flex gap-2 rounded px-1 py-0.5 text-caption text-ink-soft transition-colors hover:bg-mist hover:text-ink"
                  >
                    <span className="w-4 shrink-0 text-right font-mono text-muted">
                      {d.day_no}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </nav>
  );
}
